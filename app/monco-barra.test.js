'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const B = require('./js/monco-barra.js');
const M = require('./js/casca-modelo.js');
const server = require('./server.js');

const ID = '11111111-2222-4333-8444-555555555555';
const CASCA = 'https://nimble.monco.io';

test('as apps seguem a sequência do método, cada uma com o seu ícone, e só o Veredicto tem modo monco por agora', () => {
  assert.deepEqual(B.APPS.map((a) => a.id), ['diagramico', 'roadmaps', 'taskboards', 'veredicto']);
  assert.deepEqual(B.APPS.map((a) => a.etapa), ['1 · Idear', '2 · Priorizar', '3 · Construir', '4 · Validar']);
  assert.deepEqual(B.APPS.filter((a) => a.monco).map((a) => a.id), ['veredicto']);
  for (const id of ['casca'].concat(B.APPS.map((a) => a.id))) {
    assert.ok(B.ICONES[id] && B.ICONES[id].formas.length > 0 && ['traco', 'cheio'].includes(B.ICONES[id].modo), 'ícone de ' + id);
  }
});

test('ligacao: sempre via Casca, com projecto e tema; nunca para uma app sem modo monco', () => {
  const cfg = { cascaUrl: CASCA + '/', projecto: ID.toUpperCase() };
  assert.equal(B.ligacao(cfg, 'veredicto', 'dark'), CASCA + '/app?ir=veredicto&projecto=' + ID + '&tema=dark');
  assert.equal(B.ligacao(cfg, 'casca', 'light'), CASCA + '/app?projecto=' + ID + '&tema=light');
  assert.equal(B.ligacao({ cascaUrl: CASCA }, 'casca', null), CASCA + '/app');
  assert.equal(B.ligacao(cfg, 'roadmaps', 'dark'), null, 'sem modo monco ainda');
  assert.equal(B.ligacao({ cascaUrl: CASCA }, 'veredicto', 'dark'), null, 'sem projecto não há app');
  assert.equal(B.ligacao(cfg, 'desconhecida', 'dark'), null);
  assert.ok(!/tema=/.test(B.ligacao(cfg, 'veredicto', 'azul')));
  for (const mau of ['', null, 'javascript:alert(1)', '//x.io', 'https://x.io/?a=1']) {
    assert.equal(B.ligacao({ cascaUrl: mau, projecto: ID }, 'veredicto', 'dark'), null, String(mau));
  }
  assert.equal(B.ligacao({ cascaUrl: CASCA, projecto: 'a&b=c' }, 'casca', 'dark'), CASCA + '/app?tema=dark', 'projecto inválido não vai');
});

test('urlComSessao: app em modo monco com o token de acesso no #hash; nada inválido passa', () => {
  const ac = { access_token: 'a.b-c_d', expires_in: 3599.7 };
  assert.equal(M.urlComSessao('https://veredicto.monco.io/', '/app', ID.toUpperCase(), ac, 'dark'),
    'https://veredicto.monco.io/app?projecto=' + ID + '#access_token=a.b-c_d&expires_in=3599&token_type=bearer&tema=dark');
  assert.ok(!/refresh/.test(M.urlComSessao('https://x.monco.io', '/app', ID, ac, 'light')));
  assert.ok(!/tema=/.test(M.urlComSessao('https://x.monco.io', '/app', ID, ac, 'azul')), 'tema inválido não vai');
  assert.equal(M.urlComSessao('javascript:alert(1)', '/app', ID, ac), null);
  assert.equal(M.urlComSessao('https://x.monco.io/?a=1', '/app', ID, ac), null);
  assert.equal(M.urlComSessao('https://x.monco.io', '/outra', ID, ac), null, 'só caminhos conhecidos');
  assert.equal(M.urlComSessao('https://x.monco.io', '/app', 'nao-e-uuid', ac), null);
  assert.match(M.urlComSessao('https://x.monco.io', '/app', ID, { access_token: 'a b&c' }), /#access_token=a%20b%26c&expires_in=/, 'o token vai codificado');
  assert.equal(M.urlComSessao('https://x.monco.io', '/app', ID, { access_token: '' }), null);
  assert.equal(M.urlComSessao('https://x.monco.io', '/app', ID, { access_token: 'x'.repeat(5000) }), null);
  assert.equal(M.urlComSessao('https://x.monco.io', '/app', ID, null), null);
});

test('monco-barra.css: blocos [data-theme] só têm cores (variáveis) e há exactamente dois', () => {
  const css = fs.readFileSync(path.join(__dirname, 'monco-barra.css'), 'utf8');
  const blocos = css.match(/\[data-theme="(light|dark)"\]\s*\{[^}]*\}/g) || [];
  assert.equal(blocos.length, 2);
  for (const b of blocos) {
    for (const p of b.replace(/^[^{]*\{|\}$/g, '').split(';').map((x) => x.split(':')[0].trim()).filter(Boolean)) {
      assert.ok(p.startsWith('--') || p === 'color-scheme', 'não-cor no tema: ' + p);
    }
  }
});

test('a barra não usa innerHTML nem style inline (CSP)', () => {
  const js = fs.readFileSync(path.join(__dirname, 'js', 'monco-barra.js'), 'utf8');
  assert.doesNotMatch(js, /innerHTML|\.style\.|setAttribute\('style'/);
});

test('a barra de apps é servida e a Casca carrega-a', async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  try {
    assert.strictEqual((await fetch(base + '/monco-barra.css')).status, 200);
    assert.strictEqual((await fetch(base + '/js/monco-barra.js')).status, 200);
    const t = await (await fetch(base + '/app')).text();
    assert.ok(t.includes('/monco-barra.css') && t.includes('/js/monco-barra.js') && t.includes('id="mb"'));
  } finally { server.close(); }
});
