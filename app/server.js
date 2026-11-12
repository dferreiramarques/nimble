'use strict';
// nimble.monco.io — a Casca: página de entrada, legais e a app (/app). Sem dependências; não guarda nada:
// os dados vivem no Supabase do projecto monco, a que o browser fala directamente (RLS no servidor da base).
const http = require('http');
const fs = require('fs');
const path = require('path');

// O URL e a chave publicável não são segredos (vão para o browser). Env permite apontar para um Supabase de teste.
const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://lnvnfksaoirhpgdmxdpn.supabase.co').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_-tfgDWqIqOv2q9aQKmRZGA_jRgpoM_Q';
// Onde vivem as apps com modo monco (atalhos em Apps → <URL>/?projecto=<id>).
const VEREDICTO_URL = (process.env.VEREDICTO_URL || 'https://veredicto.monco.io').replace(/\/+$/, '');

const FILES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/privacy': 'privacy.html',
  '/privacy.html': 'privacy.html',
  '/terms': 'terms.html',
  '/terms.html': 'terms.html',
  '/legal.css': 'legal.css',
  '/app': 'casca.html',
  '/casca.css': 'casca.css',
  '/js/theme.js': 'js/theme.js',
  '/js/supa.js': 'js/supa.js',
  '/js/casca-modelo.js': 'js/casca-modelo.js',
  '/js/casca.js': 'js/casca.js'
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const CSP_PAGINAS = "default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const CSP_APP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' " + SUPABASE_URL + "; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000'
};
const CONFIG_JS = 'window.MONCO_CONFIG = ' + JSON.stringify({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY, veredictoUrl: VEREDICTO_URL }) + ';\n';

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const conhecido = url.pathname === '/config.js' || FILES[url.pathname];
    res.writeHead(conhecido ? 405 : 404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8', 'Content-Security-Policy': CSP_PAGINAS }, HEADERS));
    return res.end(conhecido ? 'Method not allowed' : 'Not found');
  }
  if (url.pathname === '/config.js') {
    res.writeHead(200, Object.assign({ 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-cache', 'Content-Security-Policy': CSP_PAGINAS }, HEADERS));
    return res.end(req.method === 'HEAD' ? undefined : CONFIG_JS);
  }
  const file = FILES[url.pathname];
  if (!file) {
    res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8', 'Content-Security-Policy': CSP_PAGINAS }, HEADERS));
    return res.end('Not found');
  }
  const ext = path.extname(file);
  const csp = file === 'casca.html' ? CSP_APP : CSP_PAGINAS;
  res.writeHead(200, Object.assign({ 'Content-Type': TYPES[ext], 'Cache-Control': 'no-cache', 'Content-Security-Policy': csp }, HEADERS));
  res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(path.join(__dirname, file)));
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, () => console.log('nimble (casca) on :' + port + ' · supabase ' + SUPABASE_URL));
}
module.exports = server;
