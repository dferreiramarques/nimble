#!/usr/bin/env node
'use strict';
/* supabase-falso.js — um Supabase de mentira, em memória, só para testar a Casca no browser sem contas reais.
 *   node dev/supabase-falso.js [porta]       (omissão 54399; só ouve em 127.0.0.1)
 *   servir a Casca com SUPABASE_URL=http://127.0.0.1:54399 SUPABASE_KEY=falsa
 * O «email» do link mágico não é enviado: GET /falso/entrar?email=…&redirect=… faz o redirect com os tokens.
 * Imita as regras do esquema real (só @monco.io, membros, dono, leitor, gravar com versão), não o PostgREST inteiro. */
const http = require('http');
const crypto = require('crypto');

const PORTA = Number(process.argv[2]) || 54399;
const APPS = ['casca', 'roadmaps', 'taskboards', 'diagramico', 'veredicto'];
const db = { users: {}, projectos: [], membros: [], fatias: [], perfis: {} };
let ultimoLink = null;

function contaPorEmail(email) {
  email = email.toLowerCase();
  let u = Object.values(db.users).find((x) => x.email === email);
  if (!u) { u = { id: crypto.randomUUID(), email }; db.users[u.id] = u; db.perfis[u.id] = email.split('@')[0]; }
  return u;
}
function quem(req) {
  const m = /^Bearer tok\.(.+)$/.exec(req.headers.authorization || '');
  return m ? Object.values(db.users).find((u) => u.email === m[1]) || null : null;
}
const monco = (u) => !!u && u.email.endsWith('@monco.io');
const acesso = (u, p) => { const m = db.membros.find((x) => x.projecto === p && x.conta === u.id); return m ? m.acesso : null; };
const ehMembro = (u, p) => monco(u) && !!acesso(u, p);
const ehDono = (u, p) => monco(u) && acesso(u, p) === 'dono';

function enviar(res, status, corpo, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, extra || {}));
  res.end(corpo === undefined ? '' : JSON.stringify(corpo));
}
function filtro(q, campo) { const v = q.get(campo); return v && v.startsWith('eq.') ? v.slice(3) : null; }
function tokens(u) { return { access_token: 'tok.' + u.email, refresh_token: 'rt.' + u.email, expires_in: 3600, token_type: 'bearer', user: u }; }
function seleccionar(linhas, q) {
  const s = q.get('select');
  if (!s || s === '*') return linhas;
  const cs = s.split(',');
  return linhas.map((l) => Object.fromEntries(cs.map((c) => [c, l[c]])));
}

function lerCorpo(req) {
  return new Promise((ok) => { let b = ''; req.on('data', (d) => { b += d; }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { ok({}); } }); });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const q = url.searchParams;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE', 'Access-Control-Allow-Headers': 'apikey,authorization,content-type,prefer' });
    return res.end();
  }
  const corpo = await lerCorpo(req);
  const u = quem(req);
  const p = url.pathname;

  // ── auth ──
  if (p === '/auth/v1/otp') { ultimoLink = { email: corpo.email, redirect: q.get('redirect_to') }; console.log('link mágico (falso) para', corpo.email, '→ /falso/entrar'); return enviar(res, 200, {}); }
  if (p === '/falso/entrar') {
    const email = q.get('email') || (ultimoLink && ultimoLink.email);
    const destino = q.get('redirect') || (ultimoLink && ultimoLink.redirect);
    if (!email || !destino || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(destino)) return enviar(res, 400, { message: 'email e redirect local obrigatórios' });
    const t = tokens(contaPorEmail(email));
    res.writeHead(302, { Location: destino + '#access_token=' + t.access_token + '&expires_in=3600&refresh_token=' + t.refresh_token + '&token_type=bearer&type=magiclink' });
    return res.end();
  }
  if (p === '/auth/v1/user') return u ? enviar(res, 200, u) : enviar(res, 401, { msg: 'invalid JWT' });
  if (p === '/auth/v1/token') {
    const m = /^rt\.(.+)$/.exec(corpo.refresh_token || '');
    const v = m && Object.values(db.users).find((x) => x.email === m[1]);
    return v ? enviar(res, 200, tokens(v)) : enviar(res, 400, { error_description: 'Invalid Refresh Token' });
  }
  if (p === '/auth/v1/logout') return enviar(res, 204);
  if (!u) return enviar(res, 401, { message: 'JWT expired' });

  // ── RPC ──
  if (p === '/rest/v1/rpc/gravar_fatia') {
    const m = db.membros.find((x) => x.projecto === corpo.p_projecto && x.conta === u.id);
    if (!monco(u) || !m || m.acesso === 'leitor' || !m.apps.includes(corpo.p_app)) return enviar(res, 403, { code: '42501', message: 'sem permissão para escrever em ' + corpo.p_app });
    const f = db.fatias.find((x) => x.projecto === corpo.p_projecto && x.app === corpo.p_app);
    if (f.versao !== corpo.p_versao_lida) return enviar(res, 200, { ok: false, conflito: true, versao: f.versao, dados: f.dados, por: f.por, em: f.em });
    Object.assign(f, { dados: corpo.p_dados, versao: f.versao + 1, por: u.id, em: new Date().toISOString() });
    return enviar(res, 200, { ok: true, versao: f.versao });
  }
  if (p === '/rest/v1/rpc/adicionar_membro') {
    if (!ehDono(u, corpo.p_projecto)) return enviar(res, 403, { code: '42501', message: 'só o dono adiciona membros' });
    if (!String(corpo.p_email).toLowerCase().endsWith('@monco.io')) return enviar(res, 400, { code: '22023', message: 'só contas @monco.io' });
    const v = Object.values(db.users).find((x) => x.email === String(corpo.p_email).toLowerCase());
    if (!v) return enviar(res, 200, { ok: false, erro: 'essa conta ainda não entrou no monco' });
    const m = db.membros.find((x) => x.projecto === corpo.p_projecto && x.conta === v.id);
    if (m) m.acesso = corpo.p_acesso; else db.membros.push({ projecto: corpo.p_projecto, conta: v.id, acesso: corpo.p_acesso, apps: APPS.slice() });
    return enviar(res, 200, { ok: true, conta: v.id });
  }

  // ── tabelas ──
  const tabela = p.replace('/rest/v1/', '');
  if (tabela === 'projectos') {
    if (req.method === 'POST') {
      if (!monco(u)) return enviar(res, 403, { code: '42501', message: 'new row violates row-level security policy for table "projectos"' });
      const pr = { id: crypto.randomUUID(), nome: String(corpo.nome || '').slice(0, 80), criado_por: u.id, criado_em: new Date().toISOString(), arquivado: false };
      db.projectos.push(pr);
      db.membros.push({ projecto: pr.id, conta: u.id, acesso: 'dono', apps: APPS.slice() });
      const vazio = { casca: { canvas: { nome: pr.nome }, equipa: [] }, roadmaps: { app: 'roadmaps', version: 1, current: null, roadmaps: [] }, taskboards: { boards: [] }, diagramico: { diagramas: [] }, veredicto: { app: 'veredicto', versao: 1, hipoteses: [], decisoes: [] } };
      APPS.forEach((a) => db.fatias.push({ projecto: pr.id, app: a, dados: vazio[a], versao: 1, por: u.id, em: pr.criado_em }));
      return enviar(res, 201, seleccionar([pr], q));
    }
    const id = filtro(q, 'id');
    if (req.method === 'PATCH') { const pr = db.projectos.find((x) => x.id === id); if (pr && ehDono(u, id)) Object.assign(pr, corpo); return enviar(res, 204); }
    let ls = db.projectos.filter((x) => monco(u) && (x.criado_por === u.id || ehMembro(u, x.id)));
    if (id) ls = ls.filter((x) => x.id === id);
    if (q.get('arquivado') === 'is.false') ls = ls.filter((x) => !x.arquivado);
    ls.sort((a, b) => b.criado_em.localeCompare(a.criado_em));
    return enviar(res, 200, seleccionar(ls, q));
  }
  if (tabela === 'fatias') { const pr = filtro(q, 'projecto'); return enviar(res, 200, seleccionar(db.fatias.filter((x) => x.projecto === pr && ehMembro(u, pr)), q)); }
  if (tabela === 'membros') {
    const pr = filtro(q, 'projecto'), conta = filtro(q, 'conta');
    if (req.method === 'PATCH') { const m = db.membros.find((x) => x.projecto === pr && x.conta === conta); if (m && ehDono(u, pr)) { m.acesso = corpo.acesso; return enviar(res, 200, [m]); } return enviar(res, 200, []); }
    if (req.method === 'DELETE') { const i = db.membros.findIndex((x) => x.projecto === pr && x.conta === conta && (ehDono(u, pr) || conta === u.id)); const r = i >= 0 ? db.membros.splice(i, 1) : []; return enviar(res, 200, r); }
    return enviar(res, 200, seleccionar(db.membros.filter((x) => x.projecto === pr && ehMembro(u, pr)), q));
  }
  if (tabela === 'perfis') {
    const m = /^in\.\((.*)\)$/.exec(q.get('conta') || '');
    const contas = m ? m[1].split(',').map(decodeURIComponent) : [];
    return enviar(res, 200, contas.filter((c) => db.perfis[c] !== undefined && (c === u.id || db.membros.some((a) => a.conta === u.id && db.membros.some((b) => b.projecto === a.projecto && b.conta === c)))).map((c) => ({ conta: c, nome: db.perfis[c] })));
  }
  return enviar(res, 404, { message: 'sem rota no Supabase falso: ' + req.method + ' ' + p });
}).listen(PORTA, '127.0.0.1', () => console.log('Supabase falso em http://127.0.0.1:' + PORTA));
