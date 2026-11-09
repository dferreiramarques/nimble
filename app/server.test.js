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
  for (const p of ['/server.js', '/package.json', '/../package.json', '/%2e%2e/server.js', '/js/', '/supa.test.js', '/arquivo/direccao-produto/app.js', '/js/../server.js']) {
    assert.strictEqual((await fetch(base + p)).status, 404, p);
  }
});

test('a Casca: /app, os scripts, e a config com o Supabase', async () => {
  const r = await fetch(base + '/app');
  assert.strictEqual(r.status, 200);
  const html = await r.text();
  assert.match(html, /<title>Casca · monco<\/title>/);
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /connect-src 'self' https:\/\/[a-z]+\.supabase\.co;/);
  assert.doesNotMatch(csp, /unsafe-inline/);
  for (const m of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
    assert.strictEqual((await fetch(base + m[1])).status, 200, m[1]);
  }
  const cfg = await (await fetch(base + '/config.js')).text();
  assert.match(cfg, /^window\.MONCO_CONFIG = \{"supabaseUrl":"https:\/\/[a-z]+\.supabase\.co","supabaseKey":"sb_publishable_[^"]+"\};\n$/);
});

test('a Casca não tem script inline, style="" nem handlers inline', async () => {
  const t = await (await fetch(base + '/app')).text();
  assert.doesNotMatch(t, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(t, /\sstyle="|\son[a-z]+="/);
});

test('tema: blocos [data-theme] da casca.css só têm cores', () => {
  const css = require('fs').readFileSync(require('path').join(__dirname, 'casca.css'), 'utf8');
  const blocos = css.match(/\[data-theme="(light|dark)"\]\s*\{[^}]*\}/g) || [];
  assert.strictEqual(blocos.length, 2);
  for (const b of blocos) {
    for (const p of b.replace(/^[^{]*\{|\}$/g, '').split(';').map((x) => x.split(':')[0].trim()).filter(Boolean)) {
      assert.ok(p.startsWith('--') || p === 'color-scheme', 'não-cor no tema: ' + p);
    }
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
