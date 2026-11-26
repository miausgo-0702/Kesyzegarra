/* ==========================================================================
   Servidor estático + sincronización en vivo para la pantalla de TV.

   - GET  /api/state   → estado actual
   - POST /api/state   → una terminal publica su estado
   - GET  /api/stream  → Server-Sent Events para televisiones
   Sin dependencias externas. Escucha en 0.0.0.0 para acceso por red local.
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.SERNOVA_PORT) || 8765;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'state.json');
const clients = new Set();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function readState() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { return null; }
}

function writeState(value) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, DATA_FILE);
}

function broadcast(value) {
  const message = 'data: ' + JSON.stringify(value) + '\n\n';
  clients.forEach(res => { try { res.write(message); } catch (e) { clients.delete(res); } });
}

function sendJson(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let relative = decodeURIComponent(pathname);
  if (relative === '/' || relative === '') relative = '/index.html';
  const filePath = path.resolve(ROOT, '.' + relative);
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (pathname === '/api/state' && req.method === 'GET') {
    sendJson(res, 200, readState());
    return;
  }

  if (pathname === '/api/state' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 8 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const value = JSON.parse(body);
        if (!value || typeof value !== 'object' || !value.market || !value.entries) {
          sendJson(res, 400, { ok: false, error: 'Estado inválido' });
          return;
        }
        writeState(value);
        broadcast(value);
        sendJson(res, 200, { ok: true, at: Date.now() });
      } catch (e) {
        sendJson(res, 400, { ok: false, error: 'JSON inválido' });
      }
    });
    return;
  }

  if (pathname === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 3000\n\n');
    const current = readState();
    if (current) res.write('data: ' + JSON.stringify(current) + '\n\n');
    clients.add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) { clearInterval(ping); } }, 25000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  if (pathname === '/api/health') {
    sendJson(res, 200, { ok: true, clients: clients.size, hasState: !!readState() });
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('SERNOVA EXCHANGE corriendo en http://localhost:' + PORT);
  console.log('Pantalla TV: http://localhost:' + PORT + '/tv.html');
});
