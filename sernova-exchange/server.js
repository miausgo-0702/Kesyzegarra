/* ==========================================================================
   SERNOVA EXCHANGE — servidor estático + sincronización en vivo.

   - GET  /api/state    → estado público actual (sin datos de administrador)
   - POST /api/state    → una terminal publica su estado
                          · desde esta misma computadora: siempre permitido
                          · desde otro dispositivo: requiere la clave de publicación
                            (cabecera X-Sernova-Key) salvo SERNOVA_OPEN=1
   - GET  /api/key      → entrega la clave de publicación (solo desde localhost)
   - GET  /api/stream   → Server-Sent Events para televisores
   - GET  /api/health   → diagnóstico rápido

   Sin dependencias externas. Escucha en 0.0.0.0 para acceso por red local.
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const PORT = Number(process.env.SERNOVA_PORT) || 8765;
const OPEN = process.env.SERNOVA_OPEN === '1';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'state.json');
const KEY_FILE = path.join(DATA_DIR, 'publish-key.txt');
const MAX_BODY = 6 * 1024 * 1024;
const STARTED = Date.now();

const clients = new Set();
let current = null;
let currentJson = 'null';
let broadcastTimer = null;
let writeTimer = null;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8'
};
const PUBLIC_EXT = new Set(['.html', '.css', '.js', '.webmanifest', '.svg', '.png', '.ico', '.md']);
const BLOCKED = new Set(['server.js', 'package.json', 'package-lock.json', 'INICIAR.bat', 'start.sh']);

/* ------------------------------------------------------------------ datos */
function ensureDataDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }

function loadKey() {
  ensureDataDir();
  try {
    const k = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (/^[A-Z0-9]{6,}$/.test(k)) return k;
  } catch (e) { /* se genera abajo */ }
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let k = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) k += alphabet[bytes[i] % alphabet.length];
  fs.writeFileSync(KEY_FILE, k + '\n', { mode: 0o600 });
  return k;
}
const PUBLISH_KEY = loadKey();

function loadState() {
  try {
    current = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    currentJson = JSON.stringify(current);
  } catch (e) { current = null; currentJson = 'null'; }
}

function persistSoon() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      ensureDataDir();
      const tmp = DATA_FILE + '.tmp';
      fs.writeFileSync(tmp, currentJson);
      fs.renameSync(tmp, DATA_FILE);
    } catch (e) { console.error('No se pudo guardar el estado:', e.message); }
  }, 400);
}

/* Quita cualquier dato sensible que una terminal vieja pudiera enviar. */
function sanitize(value) {
  if (value && value.admin) {
    const a = value.admin;
    value.admin = { paused: !!a.paused, pausedAt: a.pausedAt || 0, crashMs: a.crashMs, tickMs: a.tickMs, crashPct: a.crashPct, rallyPct: a.rallyPct, crashDurationMs: a.crashDurationMs };
  }
  return value;
}

/* ------------------------------------------------------------------ SSE */
function broadcastSoon() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const message = 'data: ' + currentJson + '\n\n';
    clients.forEach(res => { try { res.write(message); } catch (e) { clients.delete(res); } });
  }, 120);
}

/* ---------------------------------------------------------------- helpers */
function isLoopback(req) {
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function securityHeaders(extra) {
  return Object.assign({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  }, extra || {});
}

function send(req, res, code, type, body, cache) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const headers = securityHeaders({
    'Content-Type': type,
    'Cache-Control': cache || 'no-store',
    'Vary': 'Accept-Encoding'
  });
  const gzipOk = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && buf.length > 1024 && /text|json|javascript|svg/.test(type);
  if (gzipOk) {
    buf = zlib.gzipSync(buf, { level: 6 });
    headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = buf.length;
  res.writeHead(code, headers);
  res.end(req.method === 'HEAD' ? undefined : buf);
}

function sendJson(req, res, code, payload) {
  send(req, res, code, 'application/json; charset=utf-8', typeof payload === 'string' ? payload : JSON.stringify(payload));
}

const fileCache = new Map();
function serveStatic(req, res, pathname) {
  let relative;
  try { relative = decodeURIComponent(pathname); } catch (e) { relative = '/'; }
  if (relative === '/' || relative === '') relative = '/index.html';
  const filePath = path.resolve(ROOT, '.' + relative);
  const rel = path.relative(ROOT, filePath);
  const parts = rel.split(path.sep);
  const ext = path.extname(filePath).toLowerCase();
  if (rel.startsWith('..') || path.isAbsolute(rel) || parts.some(p => p.startsWith('.')) ||
      parts[0] === 'data' || parts[0] === 'node_modules' || BLOCKED.has(rel) || !PUBLIC_EXT.has(ext)) {
    send(req, res, 404, 'text/plain; charset=utf-8', 'No encontrado');
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) { send(req, res, 404, 'text/plain; charset=utf-8', 'No encontrado'); return; }
    const etag = 'W/"' + stat.size.toString(36) + '-' + stat.mtimeMs.toString(36) + '"';
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, securityHeaders({ ETag: etag }));
      res.end();
      return;
    }
    const cached = fileCache.get(filePath);
    const done = data => {
      fileCache.set(filePath, { etag, data });
      res.setHeader('ETag', etag);
      send(req, res, 200, MIME[ext] || 'application/octet-stream', data, 'no-cache');
    };
    if (cached && cached.etag === etag) done(cached.data);
    else fs.readFile(filePath, (e, data) => e ? send(req, res, 500, 'text/plain', 'Error') : done(data));
  });
}

/* ---------------------------------------------------------------- server */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  if (pathname === '/api/state' && (req.method === 'GET' || req.method === 'HEAD')) {
    sendJson(req, res, 200, currentJson);
    return;
  }

  if (pathname === '/api/state' && req.method === 'POST') {
    if (!OPEN && !isLoopback(req) && req.headers['x-sernova-key'] !== PUBLISH_KEY) {
      req.resume();
      sendJson(req, res, 401, { ok: false, error: 'Clave de publicación requerida' });
      return;
    }
    const chunks = [];
    let size = 0;
    let aborted = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { aborted = true; sendJson(req, res, 413, { ok: false, error: 'Estado demasiado grande' }); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!value || typeof value !== 'object' || !value.market || !Array.isArray(value.entries)) {
          sendJson(req, res, 400, { ok: false, error: 'Estado inválido' });
          return;
        }
        current = sanitize(value);
        current.serverAt = Date.now();
        currentJson = JSON.stringify(current);
        persistSoon();
        broadcastSoon();
        sendJson(req, res, 200, { ok: true, at: current.serverAt, clients: clients.size });
      } catch (e) {
        sendJson(req, res, 400, { ok: false, error: 'JSON inválido' });
      }
    });
    return;
  }

  if (pathname === '/api/key' && req.method === 'GET') {
    if (!isLoopback(req)) { sendJson(req, res, 403, { ok: false, error: 'Solo disponible en la computadora del servidor' }); return; }
    sendJson(req, res, 200, { ok: true, key: PUBLISH_KEY, open: OPEN });
    return;
  }

  if (pathname === '/api/stream') {
    res.writeHead(200, securityHeaders({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }));
    res.write('retry: 3000\n\n');
    if (current) res.write('data: ' + currentJson + '\n\n');
    clients.add(res);
    const ping = setInterval(() => { try { res.write(': ping ' + Date.now() + '\n\n'); } catch (e) { clearInterval(ping); } }, 20000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }

  if (pathname === '/api/health') {
    sendJson(req, res, 200, {
      ok: true, clients: clients.size, hasState: !!current,
      updatedAt: current ? current.updatedAt : null,
      uptime: Math.round((Date.now() - STARTED) / 1000), open: OPEN
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(req, res, 405, 'text/plain; charset=utf-8', 'Método no permitido');
    return;
  }

  serveStatic(req, res, pathname);
});

function lanAddresses() {
  const out = [];
  Object.values(os.networkInterfaces()).forEach(list => (list || []).forEach(i => {
    if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }));
  return out;
}

loadState();
server.listen(PORT, '0.0.0.0', () => {
  const line = '─'.repeat(58);
  console.log('\n  SERNOVA EXCHANGE');
  console.log('  ' + line);
  console.log('  Terminal      http://localhost:' + PORT + '/');
  console.log('  Pantalla TV   http://localhost:' + PORT + '/tv.html');
  lanAddresses().forEach(ip => console.log('  En la red     http://' + ip + ':' + PORT + '/tv.html'));
  console.log('  ' + line);
  console.log(OPEN
    ? '  Publicación abierta (SERNOVA_OPEN=1): cualquier equipo de la red puede publicar.'
    : '  Clave para terminales en otros equipos:  ' + PUBLISH_KEY + '\n  (Admin → Sistema → Sincronización)');
  console.log('  Ctrl+C para detener.\n');
});

function shutdown() {
  clients.forEach(res => { try { res.end(); } catch (e) { /* noop */ } });
  if (writeTimer) {
    clearTimeout(writeTimer);
    try { ensureDataDir(); fs.writeFileSync(DATA_FILE, currentJson); } catch (e) { /* noop */ }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
