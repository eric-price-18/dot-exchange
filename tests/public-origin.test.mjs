import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePublicOrigin } from '../lib/public-origin.mts';

test('public origin comes from an explicit deployment setting and is normalized', () => {
  assert.equal(resolvePublicOrigin('https://configured.dotx.test'), 'https://configured.dotx.test');
  assert.equal(resolvePublicOrigin(' https://CONFIGURED.dotx.test:443/ '), 'https://configured.dotx.test');
  assert.equal(resolvePublicOrigin('https://configured.dotx.test:8443'), 'https://configured.dotx.test:8443');
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(resolvePublicOrigin(`http://${host}:5173/`), `http://${host}:5173`);
  }
});

test('missing, placeholder, insecure and non-origin configuration fails closed', () => {
  for (const value of [undefined, null, 42, '', ' ', 'dotx.test', '//dotx.test',
    'https://dot-exchange.example', 'https://DOT-EXCHANGE.EXAMPLE/',
    'https://dot-exchange.example.', 'https://configured&bad.dotx.test',
    'https://configured%26bad.dotx.test',
    'http://configured.dotx.test', 'http://localhost.attacker.test',
    'ftp://configured.dotx.test', 'javascript:alert(1)',
    'https://user:password@configured.dotx.test', 'https://configured.dotx.test/path',
    'https://configured.dotx.test/a/..', 'https://configured.dotx.test?x=1',
    'https://configured.dotx.test?', 'https://configured.dotx.test/#',
    'https://configured.dotx.test/#anchor', 'https://configured.dotx.test\\path',
    'https://configured.\ndotx.test', 'https://configured.dotx.test\u0000',
    'https://configured.dotx.test\n', 'https://configured.dotx.test:invalid']) {
    assert.throws(() => resolvePublicOrigin(value), /PUBLIC_SITE_ORIGIN/);
  }
});
