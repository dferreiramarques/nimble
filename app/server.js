'use strict';
// Parking server for nimble.monco.io: serves a closed list of static pages. No dependencies, stores nothing.
const http = require('http');
const fs = require('fs');
const path = require('path');

const FILES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/privacy': 'privacy.html',
  '/privacy.html': 'privacy.html',
  '/terms': 'terms.html',
  '/terms.html': 'terms.html',
  '/legal.css': 'legal.css'
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const HEADERS = {
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  const file = FILES[url.pathname];
  if (!file || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(file ? 405 : 404, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, HEADERS));
    return res.end(file ? 'Method not allowed' : 'Not found');
  }
  const ext = path.extname(file);
  res.writeHead(200, Object.assign({ 'Content-Type': TYPES[ext], 'Cache-Control': 'public, max-age=300' }, HEADERS));
  res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(path.join(__dirname, file)));
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, () => console.log('nimble parking on :' + port));
}
module.exports = server;
