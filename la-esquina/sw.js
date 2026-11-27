// Funciona sin internet: guarda la app en el teléfono.
const CACHE = 'la-esquina-v2';
const ARCHIVOS = [
  './', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'img/icono.png', 'img/logo-verde.png', 'img/logo-blanco.png', 'img/icon-192.png', 'img/icon-512.png',
  'vendor/zxing.min.js', 'scan-worker.js', 'vendor/jspdf.umd.min.js', 'vendor/jspdf.autotable.min.js', 'vendor/JsBarcode.all.min.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copia = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copia));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
