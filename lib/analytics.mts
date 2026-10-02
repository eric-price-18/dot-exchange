import { AsyncLocalStorage } from 'node:async_hooks';

// Aggregate-only telemetry. Never pass arbitrary request/user/content values to D1.
type Channel = 'web' | 'rest' | 'mcp';
type Outcome = 'success' | 'client_error' | 'server_error' | 'other' | 'error';
type Metric = 'page_requests' | 'searches' | 'questions_created' | 'answers_created' | 'tips_created' | 'replies_created' | 'api_requests' | 'mcp_tool_calls';
type Traffic = 'known_automation' | 'unclassified';
type Event = { metric: Metric; operation: string; outcome: Outcome };
type Context = { channel: Channel; events: Map<string, Event> };
const contexts = new AsyncLocalStorage<Context>();
const MCP_TOOLS = new Set(['list_questions', 'get_question', 'ask_question', 'answer_question', 'withdraw_post', 'list_tips', 'get_tip', 'publish_tip', 'reply_to_tip', 'append_update', 'set_accepted_answer', 'edit_post', 'edit_update', 'get_revisions', 'get_acceptance_history']);
const DAY_MS = 86_400_000;
export const RETENTION_DAYS = 90;

function mark(metric: Metric, operation = 'all', outcome: Outcome = 'success') {
  const context = contexts.getStore();
  if (!context) return;
  const event = { metric, operation, outcome };
  // One semantic event of each type per request, including repeated SSR renders.
  context.events.set(`${metric}:${operation}:${outcome}`, event);
}
export function markSearch() { mark('searches'); }
export function markCreated(kind: 'question' | 'answer' | 'tip' | 'reply') {
  mark(({question:'questions_created',answer:'answers_created',tip:'tips_created',reply:'replies_created'} as const)[kind]);
}
export function markMcpTool(name: unknown, success: boolean) {
  mark('mcp_tool_calls', typeof name === 'string' && MCP_TOOLS.has(name) ? name : 'unknown', success ? 'success' : 'error');
}

function suppressed(request: Request) {
  const h = request.headers;
  return request.method === 'HEAD'
    || h.get('rsc') === '1'
    || h.has('next-router-prefetch')
    || /prefetch/i.test(`${h.get('purpose') || ''} ${h.get('sec-purpose') || ''}`)
    || /\bDotExchangeSmokeTest\//i.test(h.get('user-agent') || '');
}
function statusOutcome(status: number): Outcome {
  return status >= 500 ? 'server_error' : status >= 400 ? 'client_error' : status >= 200 && status < 400 ? 'success' : 'other';
}
function restOperation(path: string, method: string): string | null {
  if (path === '/api/v1') return 'discovery';
  if (path === '/api/v1/questions') return method === 'POST' ? 'question_create' : 'questions_list';
  if (path === '/api/v1/tips') return method === 'POST' ? 'tip_create' : 'tips_list';
  if (/^\/api\/v1\/tips\/[^/]+\/replies$/.test(path)) return 'reply_create';
  if (/^\/api\/v1\/tips\/[^/]+$/.test(path)) return 'tip_read';
  if (/^\/api\/v1\/questions\/[^/]+\/acceptance$/.test(path)) return 'question_acceptance';
  if (/^\/api\/v1\/revisions\/[^/]+$/.test(path)) return 'revisions_read';
  if (/^\/api\/v1\/posts\/[^/]+\/updates\/[^/]+$/.test(path)) return 'update_edit';
  if (/^\/api\/v1\/posts\/[^/]+\/updates$/.test(path)) return 'post_update';
  if (/^\/api\/v1\/questions\/[^/]+\/answers$/.test(path)) return 'answer_create';
  if (/^\/api\/v1\/questions\/[^/]+$/.test(path)) return 'question_read';
  if (/^\/api\/v1\/posts\/[^/]+$/.test(path)) return method === 'PATCH' ? 'post_edit' : 'post_withdraw';
  return null; // Session polling, unknown routes, static files, and auth are excluded.
}
function addRequestEvent(request: Request, response?: Response) {
  const path = new URL(request.url).pathname;
  const outcome = statusOutcome(response?.status ?? 500);
  const operation = restOperation(path, request.method);
  if (operation) mark('api_requests', operation, outcome);
  else if (path === '/mcp') mark('api_requests', 'mcp_transport', outcome);
  if (request.method !== 'GET' || response?.status !== 200
    || !response.headers.get('content-type')?.includes('text/html')) return;
  const page = path === '/' ? 'home' : path === '/api' ? 'api_guide' : path === '/start' ? 'start_guide'
    : path === '/tips' ? 'tips' : /^\/tips\/[^/]+$/.test(path) ? 'tip' : /^\/questions\/[^/]+$/.test(path) ? 'question' : null;
  if (page) mark('page_requests', page);
}

async function persist(db: D1Database | undefined, context: Context, traffic: Traffic, now: Date) {
  if (!db || context.events.size === 0) return;
  try {
    const day = now.toISOString().slice(0, 10);
    const oldestDay = new Date(Date.parse(`${day}T00:00:00Z`) - (RETENTION_DAYS - 1) * DAY_MS).toISOString().slice(0, 10);
    const statements = [...context.events.values()].map(event => db.prepare(
      `INSERT INTO analytics_daily(day,metric,channel,operation,outcome,traffic_class,count)
       VALUES(?,?,?,?,?,?,1)
       ON CONFLICT(day,metric,channel,operation,outcome,traffic_class)
       DO UPDATE SET count=count+1`,
    ).bind(day, event.metric, context.channel, event.operation, event.outcome, traffic));
    statements.push(db.prepare('DELETE FROM analytics_daily WHERE day < ?').bind(oldestDay));
    await db.batch(statements);
  } catch {
    // Telemetry must never turn a successful post/read into a failure or log content.
    console.warn('Dot Exchange aggregate analytics unavailable');
  }
}

export async function runWithAnalytics(
  request: Request,
  db: D1Database | undefined,
  execution: Pick<ExecutionContext, 'waitUntil'>,
  run: () => Response | Promise<Response>,
  now = new Date(),
): Promise<Response> {
  if (suppressed(request)) return run();
  const path = new URL(request.url).pathname;
  const context: Context = { channel: path === '/mcp' ? 'mcp' : path.startsWith('/api/v1') ? 'rest' : 'web', events: new Map() };
  // UA is inspected transiently, never persisted. Unclassified does not mean human.
  const traffic: Traffic = /bot\b|crawler|spider|headless|curl\/|wget\/|python-|httpx\/|node\b/i.test(request.headers.get('user-agent') || '')
    ? 'known_automation' : 'unclassified';
  return contexts.run(context, async () => {
    let response: Response | undefined;
    try {
      response = await run();
      return response;
    } finally {
      addRequestEvent(request, response);
      const pending = persist(db, context, traffic, now);
      try { execution.waitUntil(pending); } catch { await pending; }
    }
  });
}
