import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { runWithAnalytics, markCreated, markSearch, markMcpTool } from '../lib/analytics.mts';

const date = new Date('2026-09-30T23:59:59Z');
function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../drizzle/0001_youthful_ezekiel_stane.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(text) { return { bind(...values) { return { text, values }; } }; },
    async batch(statements) {
      sql.exec('BEGIN');
      try { for (const s of statements) sql.prepare(s.text).run(...s.values); sql.exec('COMMIT'); }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
      return [];
    },
  };
  const rows = () => sql.prepare('SELECT * FROM analytics_daily ORDER BY day,metric,operation,outcome').all().map(r => ({ ...r }));
  async function request(path = '/', { method = 'GET', headers = {}, status = 200, type = 'text/html', action = () => {}, now = date } = {}) {
    const pending = [];
    const response = await runWithAnalytics(new Request(`https://example.test${path}`, { method, headers }), db, { waitUntil(p) { pending.push(p); } }, async () => {
      await action();
      return new Response('response-content', { status, headers: { 'content-type': type } });
    }, now);
    await Promise.all(pending);
    return response;
  }
  return { sql, db, rows, request };
}

test('counts HTML document requests, not static, sessions, HEAD, RSC, prefetch or smoke tests', async () => {
  const f = fixture();
  await f.request('/'); await f.request('/');
  await f.request('/questions/q_private-id'); await f.request('/api');
  for (const path of ['/favicon.svg', '/signin-with-chatgpt', '/callback', '/api/v1/session', '/analytics', '/api/v1/analytics']) await f.request(path);
  for (const options of [{ method: 'HEAD' }, { headers: { rsc: '1' } }, { headers: { 'next-router-prefetch': '1' } }, { headers: { purpose: 'prefetch' } }, { headers: { 'sec-purpose': 'prefetch;prerender' } }, { headers: { 'user-agent': 'DotExchangeSmokeTest/1.0' } }]) await f.request('/', options);
  await f.request('/', { status: 404 }); await f.request('/', { type: 'application/json' });
  assert.deepEqual(f.rows().map(({ operation, count }) => ({ operation, count })), [{ operation: 'api_guide', count: 1 }, { operation: 'home', count: 2 }, { operation: 'question', count: 1 }]);
});

test('keeps only fixed aggregate dimensions; deduplicates repeated semantic events within one request', async () => {
  const f = fixture();
  const secrets = ['private-search', 'private-author', 'private-email@example.test', '203.0.113.5', 'private-referrer', 'private-cookie', 'private-body', 'private-agent'];
  await f.request('/?q=private-search', { headers: {
    'oai-authenticated-user-id': secrets[1], 'oai-authenticated-user-email': secrets[2],
    'cf-connecting-ip': secrets[3], referer: secrets[4], cookie: secrets[5], 'user-agent': secrets[7],
  }, action() { markSearch(); markSearch(); } });
  await f.request('/api/v1/questions', { method: 'POST', type: 'application/json', action() { markCreated('question'); } });
  await f.request('/mcp', { method: 'POST', type: 'application/json', action() { markCreated('answer'); markMcpTool('answer_question', true); markMcpTool('private-body', false); } });
  const rows = f.rows();
  assert.equal(rows.find(r => r.metric === 'searches').count, 1);
  assert.equal(rows.find(r => r.metric === 'questions_created').channel, 'rest');
  assert.equal(rows.find(r => r.metric === 'answers_created').channel, 'mcp');
  assert.equal(rows.find(r => r.operation === 'unknown').outcome, 'error');
  for (const value of secrets) assert.ok(!JSON.stringify(rows).includes(value), value);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['channel', 'count', 'day', 'metric', 'operation', 'outcome', 'traffic_class']);
});

test('keeps HTTP outcomes distinct from MCP semantic errors and labels automation as heuristic', async () => {
  const f = fixture();
  await f.request('/mcp', { method: 'POST', type: 'application/json', headers: { 'user-agent': 'curl/8.0' }, action() { markMcpTool('ask_question', false); } });
  await f.request('/api/v1/questions', { status: 401, type: 'application/json' });
  await f.request('/api/v1/questions', { status: 503, type: 'application/json' });
  const rows = f.rows();
  assert.equal(rows.find(r => r.metric === 'mcp_tool_calls').outcome, 'error');
  assert.equal(rows.find(r => r.operation === 'mcp_transport').outcome, 'success');
  assert.equal(rows.find(r => r.operation === 'mcp_transport').traffic_class, 'known_automation');
  assert.deepEqual(rows.filter(r => r.channel === 'rest').map(r => r.outcome), ['client_error', 'server_error']);
});

test('atomic increments, UTC rollover and the inclusive 90-day retention boundary', async () => {
  const f = fixture();
  await f.request('/', { now: new Date('2026-07-02T23:59:59Z') });
  await f.request('/', { now: new Date('2026-07-03T00:00:00Z') });
  await Promise.all(Array.from({ length: 40 }, () => f.request('/')));
  assert.deepEqual(f.rows().map(({ day, count }) => ({ day, count })), [{ day: '2026-07-03', count: 1 }, { day: '2026-09-30', count: 40 }]);
  await f.request('/', { now: new Date('2026-10-01T00:00:00Z') });
  assert.deepEqual(f.rows().map(({ day, count }) => ({ day, count })), [{ day: '2026-09-30', count: 40 }, { day: '2026-10-01', count: 1 }]);
});

test('request contexts remain isolated under concurrency', async () => {
  const f = fixture();
  await Promise.all([
    f.request('/', { action: async () => { await new Promise(r => setTimeout(r, 8)); markSearch(); } }),
    f.request('/mcp', { method: 'POST', action: async () => { await new Promise(r => setTimeout(r, 1)); markMcpTool('get_question', true); } }),
  ]);
  assert.equal(f.rows().find(r => r.metric === 'searches').channel, 'web');
  assert.equal(f.rows().find(r => r.metric === 'mcp_tool_calls').channel, 'mcp');
});

test('analytics outages cannot fail responses or expose underlying error details', async () => {
  const pending = [], warnings = [];
  const oldWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const result = await runWithAnalytics(new Request('https://example.test/api/v1/questions'), { prepare() { throw Error('sensitive-database-detail'); } }, { waitUntil(p) { pending.push(p); } }, () => Response.json({ ok: true }));
    await Promise.all(pending);
    assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true });
    assert.deepEqual(warnings, ['Dot Exchange aggregate analytics unavailable']);
  } finally { console.warn = oldWarn; }
});
