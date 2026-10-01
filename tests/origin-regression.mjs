import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PUBLIC_ORIGIN } from './origin-fixture.mjs';

const base = 'http://127.0.0.1:8788';
const smoke = { 'User-Agent': 'DotExchangeSmokeTest/1.0' };
const actor = { 'oai-authenticated-user-id': 'origin-fixture-owner', 'oai-authenticated-user-email': 'origin@example.test' };
const payload = { title: 'Configured origin regression', body: 'Only synthetic local origin regression content.', tags: ['origin-fixture'] };
async function request(path, method = 'GET', body, headers = {}) {
  const response = await fetch(base + path, {
    method, headers: { ...smoke, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, data };
}
async function read(path, headers) {
  const result = await request(path, 'GET', undefined, headers);
  assert.equal(result.status, 200, path);
  assert.ok(!JSON.stringify(result.data).includes('dot-exchange.example'), path);
  return result.data;
}
async function post(path, body, key) {
  const result = await request(path, 'POST', body, { ...actor, 'Idempotency-Key': key });
  assert.equal(result.status, 201, JSON.stringify(result));
  return result.data;
}
async function call(name, args, headers = {}) {
  const response = await request('/mcp', 'POST', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, headers);
  assert.equal(response.status, 200, JSON.stringify(response));
  assert.equal(response.data.result.isError, false, JSON.stringify(response));
  const result = response.data.result;
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  return result.structuredContent;
}
function assertPost(post) {
  const path = post.type === 'tip' || post.type === 'reply' ? 'tips' : 'questions';
  const parent = post.question_id || post.tip_id;
  assert.equal(post.url, `${PUBLIC_ORIGIN}/${path}/${parent || post.id}${parent ? '#' + post.id : ''}`);
}

// Public discovery and metadata share one canonical deployment origin.
for (const endpoint of ['/api/v1', '/.well-known/dot-exchange.json']) {
  const index = await read(endpoint);
  for (const [field, path] of Object.entries({ api: '/api/v1', questions: '/api/v1/questions', tips: '/api/v1/tips', openapi: '/openapi.json', mcp: '/mcp', usage: '/llms.txt', start_here: '/start' })) {
    assert.equal(index[field], PUBLIC_ORIGIN + path, field);
  }
}
const openapi = await read('/openapi.json');
assert.deepEqual(openapi.servers, [{ url: PUBLIC_ORIGIN }]);
assert.equal(openapi['x-mcp'].url, PUBLIC_ORIGIN + '/mcp');
assert.ok((await read('/llms.txt')).includes(`Base: ${PUBLIC_ORIGIN}\n`));
assert.ok((await read('/robots.txt')).includes(`Sitemap: ${PUBLIC_ORIGIN}/sitemap.xml\n`));
const sitemap = await read('/sitemap.xml');
for (const [, location] of sitemap.matchAll(/<loc>(.*?)<\/loc>/g)) assert.equal(new URL(location).origin, PUBLIC_ORIGIN);
for (const path of ['/', '/start']) {
  const html = await read(path);
  const canonical = html.match(/<link(?=[^>]*\brel="canonical")(?=[^>]*\bhref="([^"]+)")[^>]*>/);
  assert.equal(canonical?.[1], PUBLIC_ORIGIN + (path === '/' ? '' : path));
}
for (const path of ['/api', '/start']) {
  // React may separate adjacent dynamic/static text with hydration comments.
  const html = (await read(path)).replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(html.includes(PUBLIC_ORIGIN + '/mcp'), path);
}

// The existing write gate permits absent, request-origin and configured-origin
// headers. Passing it never substitutes for the existing authentication check.
for (const origin of [undefined, base, PUBLIC_ORIGIN]) {
  const headers = origin ? { Origin: origin } : {};
  assert.equal((await request('/api/v1/questions', 'POST', payload, headers)).status, 401);
  assert.equal((await request('/mcp', 'POST', { jsonrpc: '2.0', id: 1, method: 'ping' }, headers)).status, 200);
}
for (const origin of ['https://evil.example', 'https://dot-exchange.example', 'null']) {
  const headers = { Origin: origin, 'X-Forwarded-Host': 'evil.example', 'X-Forwarded-Proto': 'https', Forwarded: 'host=evil.example;proto=https' };
  assert.equal((await request('/api/v1/questions', 'POST', payload, headers)).status, 403);
  assert.equal((await request('/mcp', 'POST', { jsonrpc: '2.0', id: 1, method: 'ping' }, headers)).status, 403);
}
const poisoned = await read('/api/v1', { 'X-Forwarded-Host': 'evil.example', 'X-Forwarded-Proto': 'http', Forwarded: 'host=evil.example;proto=http' });
assert.equal(poisoned.api, PUBLIC_ORIGIN + '/api/v1');

// Writes below use synthetic identity only in this isolated loopback test Worker.
const question = (await post('/api/v1/questions', payload, 'origin-question')).data;
const answer = (await post(`/api/v1/questions/${question.id}/answers`, { body: 'A local synthetic origin answer.' }, 'origin-answer')).data;
const tip = (await call('publish_tip', { ...payload, idempotency_key: 'origin-tip' }, actor)).data;
const reply = (await call('reply_to_tip', { tip_id: tip.id, body: 'A local synthetic origin reply.', idempotency_key: 'origin-reply' }, actor)).data;
for (const item of [question, answer, tip, reply]) assertPost(item);
const retried = await post('/api/v1/questions', payload, 'origin-question');
assert.equal(retried.replayed, true); assertPost(retried.data);
const retriedTip = await call('publish_tip', { ...payload, idempotency_key: 'origin-tip' }, actor);
assert.equal(retriedTip.replayed, true); assertPost(retriedTip.data);
for (const [kind, parent] of [['questions', question], ['tips', tip]]) {
  const singular = kind === 'questions' ? 'question' : 'tip';
  for (const result of [await read(`/api/v1/${kind}?q=origin-fixture`), await call(`list_${kind}`, { q: 'origin-fixture' })]) {
    assert.ok(result.data.some(post => post.id === parent.id));
    for (const item of result.data) assertPost(item);
  }
  for (const result of [await read(`/api/v1/${kind}/${parent.id}`), await call(`get_${singular}`, { id: parent.id })]) {
    assertPost(result.data);
    for (const item of result.data.answers || result.data.replies) assertPost(item);
  }
}
fs.writeFileSync('.sites-runtime/origin-durability.json', JSON.stringify({ question, tip, payload, actor }));
console.log('PASS: configured-origin REST/MCP URLs, metadata/discovery, retries and unchanged authentication/origin gates.');
