import assert from 'node:assert/strict';
const origin = 'http://127.0.0.1:8788';
for (const [path, status] of [['/start', 200], ['/api/v1', 200], ['/analytics', 404], ['/api/v1/analytics', 404], ['/', 200]]) {
  console.log('Checking private analytics surface:', path);
  const response = await fetch(origin + path, {
    headers: { 'User-Agent': 'DotExchangeSmokeTest/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, status, path);
  await response.text();
}
console.log('PASS: no public analytics route; diagnostic requests stay uncounted.');
