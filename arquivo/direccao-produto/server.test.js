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
  for (const p of ['/server.js', '/package.json', '/../package.json', '/%2e%2e/server.js', '/produto.test.js', '/server.test.js', '/railway.json']) {
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

test('a app: /app, scripts e folha servidos; CSP deixa scripts próprios mas nada de fora', async () => {
  const r = await fetch(base + '/app');
  assert.strictEqual(r.status, 200);
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'/);
  assert.ok(!/unsafe|https?:/.test(csp), csp);
  for (const p of ['/app.css', '/app.js', '/produto.js']) assert.strictEqual((await fetch(base + p)).status, 200, p);
  // as páginas de parking continuam sem scripts
  assert.ok(!/script-src/.test((await fetch(base + '/privacy')).headers.get('content-security-policy')));
});

test('a app não usa script nem estilo inline, innerHTML, rede externa nem eval', async () => {
  const fs = require('fs');
  const html = await (await fetch(base + '/app')).text();
  assert.ok((html.match(/<script[^>]*>/g) || []).every(s => s.indexOf(' src=') !== -1), 'script sem src');
  assert.ok(!/ style=|<style/.test(html), 'estilo inline');
  for (const f of ['app.js', 'produto.js']) {
    const js = fs.readFileSync(require('path').join(__dirname, f), 'utf8');
    for (const p of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'XMLHttpRequest', 'fetch(']) {
      assert.ok(js.indexOf(p) === -1, f + ' usa ' + p);
    }
    assert.ok(js.indexOf('http://') === -1 && js.indexOf('https://') === -1, f + ' refere um URL externo');
  }
});

test('o tema só troca cores: o bloco escuro tem apenas variáveis de cor', () => {
  const fs = require('fs');
  const css = fs.readFileSync(require('path').join(__dirname, 'app.css'), 'utf8');
  const ini = css.indexOf('@media (prefers-color-scheme: dark)');
  assert.ok(ini >= 0, 'bloco escuro não encontrado');
  const abre = css.indexOf(':root {', ini) + ':root {'.length;
  const corpo = css.slice(abre, css.indexOf('}', abre));
  const props = corpo.split(';').map(s => s.trim()).filter(Boolean).map(s => s.split(':')[0].trim());
  const cores = ['--bg', '--bg-2', '--bg-3', '--text', '--muted', '--line', '--accent', '--on-accent', '--danger', '--ok', '--now', '--next', '--later'];
  assert.ok(props.length > 0 && props.every(p => cores.includes(p)), 'propriedades não-cor no bloco escuro: ' + props.filter(p => !cores.includes(p)));
  // e nenhum outro bloco condicionado ao tema
  assert.strictEqual((css.match(/prefers-color-scheme/g) || []).length, 1);
});
