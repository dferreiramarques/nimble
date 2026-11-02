'use strict';
const test = require('node:test');
const assert = require('node:assert');
const server = require('./server.js');

let base;
test.before(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(() => server.close());

test('serves the parking page and the legal pages with the contact', async () => {
  for (const p of ['/', '/privacy', '/privacy.html', '/terms', '/terms.html']) {
    const r = await fetch(base + p);
    assert.strictEqual(r.status, 200, p);
    assert.match(await r.text(), /hello@monco\.io/, p);
  }
  assert.strictEqual((await fetch(base + '/legal.css')).status, 200);
});

test('health check, 404 for anything else, and no files outside the list', async () => {
  assert.strictEqual((await fetch(base + '/healthz')).status, 200);
  for (const p of ['/server.js', '/package.json', '/../package.json', '/%2e%2e/server.js', '/app']) {
    assert.strictEqual((await fetch(base + p)).status, 404, p);
  }
});

test('security headers and no inline script or style in the pages', async () => {
  const r = await fetch(base + '/');
  assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
  assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
  for (const p of ['/', '/privacy', '/terms']) {
    const t = await (await fetch(base + p)).text();
    assert.ok(!/<script|style="/.test(t), p);
  }
});

test('POST is refused', async () => {
  assert.strictEqual((await fetch(base + '/', { method: 'POST' })).status, 405);
});
