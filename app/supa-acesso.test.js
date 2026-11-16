'use strict';
/* Sessão só com token de acesso: é o que a Casca entrega às apps em modo monco (nunca o refresh_token). */
const test = require('node:test');
const assert = require('node:assert/strict');
const Supa = require('./js/supa.js');

const URL = 'https://x.supabase.co';
const HASH = '#access_token=AT1&expires_in=3600&refresh_token=RT1&token_type=bearer&type=magiclink';
const HASH_ACESSO = '#access_token=AT9&expires_in=3000&token_type=bearer&tema=dark';

function memoria() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, m }; }
function resposta(status, corpo) { return { ok: status < 400, status, text: async () => (corpo === undefined ? '' : JSON.stringify(corpo)) }; }
function falso(rotas) {
  const pedidos = [];
  const f = async (url, o) => {
    pedidos.push({ url, metodo: o.method, headers: o.headers, corpo: o.body && JSON.parse(o.body) });
    for (const [padrao, fn] of rotas) if (url.includes(padrao)) return fn(url, o, pedidos);
    return resposta(404, { message: 'sem rota ' + url });
  };
  f.pedidos = pedidos;
  return f;
}

test('lerHash aceita só o token de acesso; lerTema lê o tema do hash', () => {
  const s = Supa.criar({ url: URL, key: 'k', fetch: falso([]), storage: memoria() });
  assert.equal(s.lerHash(HASH_ACESSO).tokens.access_token, 'AT9');
  assert.equal(s.lerHash(HASH_ACESSO).tokens.refresh_token, undefined);
  assert.equal(s.lerTema(HASH_ACESSO), 'dark');
  assert.equal(s.lerTema('#access_token=x&tema=light'), 'light');
  for (const mau of ['', null, '#tema=azul', '#xtema=dark', '#tema=dark2']) assert.equal(s.lerTema(mau), null, String(mau));
});

test('sessão só com acesso: usa o token até ao fim e depois falha com 401, sem tentar renovar', async () => {
  let t = 0;
  const f = falso([
    ['/auth/v1/user', () => resposta(200, { id: 'u1', email: 'a@monco.io' })],
    ['/rest/v1/projectos', () => resposta(200, [])]
  ]);
  const st = memoria();
  const s = Supa.criar({ url: URL, key: 'k', fetch: f, storage: st, agora: () => t });
  await s.entrarComHash(HASH_ACESSO);
  assert.equal(s.soAcesso(), true);
  assert.equal(JSON.parse(st.m[Supa.CHAVE]).refresh_token, null);
  t = 2990 * 1000;   // faltam 10 s: ainda serve
  await s.listarProjectos();
  assert.equal(f.pedidos.at(-1).headers.Authorization, 'Bearer AT9');
  t = 2999 * 1000;   // falta 1 s: já não
  const antes = f.pedidos.length;
  await assert.rejects(s.listarProjectos(), (e) => e.status === 401);
  assert.equal(f.pedidos.length, antes, 'não devia fazer pedidos nem tentar renovar');
});

test('um 401 do servidor numa sessão só com acesso propaga 401 (a app volta à Casca)', async () => {
  const f = falso([
    ['/auth/v1/user', () => resposta(200, { id: 'u1', email: 'a@monco.io' })],
    ['/rest/v1/projectos', () => resposta(401, { message: 'JWT expired' })]
  ]);
  const s = Supa.criar({ url: URL, key: 'k', fetch: f, storage: memoria() });
  await s.entrarComHash(HASH_ACESSO);
  await assert.rejects(s.listarProjectos(), (e) => e.status === 401);
  assert.ok(!f.pedidos.some((p) => /grant_type=refresh_token/.test(p.url)), 'sem refresh_token não há renovação');
});

test('acesso(): só o token e o que lhe resta, nunca o refresh_token', async () => {
  let t = 0;
  const f = falso([['/auth/v1/user', () => resposta(200, { id: 'u1', email: 'a@monco.io' })]]);
  const s = Supa.criar({ url: URL, key: 'k', fetch: f, storage: memoria(), agora: () => t });
  await s.entrarComHash(HASH);   // sessão completa (a da Casca)
  assert.equal(s.soAcesso(), false);
  t = 600 * 1000;
  const a = await s.acesso();
  assert.deepEqual(Object.keys(a).sort(), ['access_token', 'expires_in']);
  assert.equal(a.access_token, 'AT1');
  assert.equal(a.expires_in, 3000);
});

test('acesso() renova primeiro se o token está a expirar', async () => {
  let t = 0;
  const f = falso([
    ['/auth/v1/user', () => resposta(200, { id: 'u1', email: 'a@monco.io' })],
    ['grant_type=refresh_token', () => resposta(200, { access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600 })]
  ]);
  const s = Supa.criar({ url: URL, key: 'k', fetch: f, storage: memoria(), agora: () => t });
  await s.entrarComHash(HASH);
  t = 3590 * 1000;
  const a = await s.acesso();
  assert.equal(a.access_token, 'AT2');
  assert.equal(a.expires_in, 3600);
});

test('acesso() sem sessão falha com 401', async () => {
  const s = Supa.criar({ url: URL, key: 'k', fetch: falso([]), storage: memoria() });
  await assert.rejects(s.acesso(), (e) => e.status === 401);
});
