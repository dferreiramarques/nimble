'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Supa = require('./js/supa.js');

function memoria() { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, m }; }
function resposta(status, corpo) { return { ok: status < 400, status, text: async () => (corpo === undefined ? '' : JSON.stringify(corpo)) }; }

/* fetch falso: regista os pedidos e responde pela tabela de rotas */
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

const URL = 'https://x.supabase.co';
const HASH = '#access_token=AT1&expires_in=3600&refresh_token=RT1&token_type=bearer&type=magiclink';

test('lerHash: tokens, erro, ou nada', () => {
  const s = Supa.criar({ url: URL, key: 'k', fetch: falso([]), storage: memoria() });
  assert.equal(s.lerHash('#/p/1'), null);
  assert.equal(s.lerHash(HASH).tokens.access_token, 'AT1');
  assert.equal(s.lerHash('#error=access_denied&error_description=Email+link+is+invalid').erro, 'Email link is invalid');
});

test('entrarComHash guarda a sessão e lê o utilizador', async () => {
  const st = memoria();
  const f = falso([['/auth/v1/user', () => resposta(200, { id: 'u1', email: 'ana@monco.io' })]]);
  const s = Supa.criar({ url: URL, key: 'k', fetch: f, storage: st });
  const u = await s.entrarComHash(HASH);
  assert.deepEqual(u, { id: 'u1', email: 'ana@monco.io' });
  assert.equal(f.pedidos[0].headers.Authorization, 'Bearer AT1');
  assert.equal(f.pedidos[0].headers.apikey, 'k');
  assert.equal(JSON.parse(st.m[Supa.CHAVE]).refresh_token, 'RT1');
  // uma instância nova recupera a sessão do storage
  assert.equal(Supa.criar({ url: URL, key: 'k', fetch: f, storage: st }).utilizador().email, 'ana@monco.io');
});

test('enviarLink manda o redirect e cria a conta', async () => {
  const f = falso([['/auth/v1/otp', () => resposta(200, {})]]);
  const s = Supa.criar({ url: URL, key: 'k', fetch: f, storage: memoria() });
  await s.enviarLink('ana@monco.io', 'https://nimble.monco.io/app');
  assert.match(f.pedidos[0].url, /redirect_to=https%3A%2F%2Fnimble\.monco\.io%2Fapp/);
  assert.deepEqual(f.pedidos[0].corpo, { email: 'ana@monco.io', create_user: true });
});

test('token a expirar → refresh antes do pedido', async () => {
  let t = 0;
  const f = falso([
    ['/auth/v1/user', () => resposta(200, { id: 'u1', email: 'a@monco.io' })],
    ['grant_type=refresh_token', () => resposta(200, { access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600 })],
    ['/rest/v1/projectos', () => resposta(200, [])]
  ]);
  const s = Supa.criar({ url: URL, key: 'k', fetch: f, storage: memoria(), agora: () => t });
  await s.entrarComHash(HASH);
  t = 3600 * 1000 - 30000;   // faltam 30 s
  await s.listarProjectos();
  const ultimos = f.pedidos.slice(-2);
  assert.match(ultimos[0].url, /grant_type=refresh_token/);
  assert.deepEqual(ultimos[0].corpo, { refresh_token: 'RT1' });
  assert.equal(ultimos[1].headers.Authorization, 'Bearer AT2');
});

test('401 força refresh e repete uma vez', async () => {
  let n = 0;
  const f = falso([
    ['/auth/v1/user', () => resposta(200, { id: 'u1', email: 'a@monco.io' })],
    ['grant_type=refresh_token', () => resposta(200, { access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600 })],
    ['/rest/v1/rpc/gravar_fatia', (u, o) => (++n === 1 ? resposta(401, { message: 'JWT expired' }) : resposta(200, { ok: true, versao: 2 }))]
  ]);
  const s = Supa.criar({ url: URL, key: 'k', fetch: f, storage: memoria() });
  await s.entrarComHash(HASH);
  const r = await s.gravarFatia('p1', 'casca', { a: 1 }, 1);
  assert.deepEqual(r, { ok: true, versao: 2 });
  assert.equal(n, 2);
  assert.deepEqual(f.pedidos.at(-1).corpo, { p_projecto: 'p1', p_app: 'casca', p_dados: { a: 1 }, p_versao_lida: 1 });
});

test('refresh recusado apaga a sessão', async () => {
  const st = memoria();
  const f = falso([
    ['/auth/v1/user', () => resposta(200, { id: 'u1', email: 'a@monco.io' })],
    ['grant_type=refresh_token', () => resposta(400, { error_description: 'Invalid Refresh Token' })]
  ]);
  const s = Supa.criar({ url: URL, key: 'k', fetch: f, storage: st });
  await s.entrarComHash(HASH);
  await assert.rejects(s.refrescar(), /Invalid Refresh Token/);
  assert.equal(s.utilizador(), null);
  assert.equal(st.m[Supa.CHAVE], undefined);
});

test('sem sessão os pedidos falham com 401', async () => {
  const s = Supa.criar({ url: URL, key: 'k', fetch: falso([]), storage: memoria() });
  await assert.rejects(s.listarProjectos(), (e) => e.status === 401);
});

test('erros do PostgREST passam a mensagem', async () => {
  const f = falso([
    ['/auth/v1/user', () => resposta(200, { id: 'u1', email: 'a@monco.io' })],
    ['/rest/v1/rpc/adicionar_membro', () => resposta(400, { code: '22023', message: 'só contas @monco.io' })]
  ]);
  const s = Supa.criar({ url: URL, key: 'k', fetch: f, storage: memoria() });
  await s.entrarComHash(HASH);
  await assert.rejects(s.adicionarMembro('p1', 'x@gmail.com', 'editor'), (e) => e.message === 'só contas @monco.io' && e.code === '22023');
});

test('ids vão codificados nos filtros', async () => {
  const f = falso([['/auth/v1/user', () => resposta(200, { id: 'u1', email: 'a@monco.io' })], ['/rest/v1/', () => resposta(200, [])]]);
  const s = Supa.criar({ url: URL, key: 'k', fetch: f, storage: memoria() });
  await s.entrarComHash(HASH);
  await s.lerFatias('a&b=c');
  assert.match(f.pedidos.at(-1).url, /projecto=eq\.a%26b%3Dc$/);
});
