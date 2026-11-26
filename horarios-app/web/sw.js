// Service worker: permite abrir la app sin conexión (PC / iPhone instalados desde el navegador).
const CACHE = "mh-v7";
const ARCHIVOS = ["./", "index.html", "styles.css", "app.js", "logic.js", "backend.js", "data.js", "config.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "img/logo.svg", "img/la-esquina.png", "img/la-esquina-blanco.png", "img/belgrano.png", "img/belgrano-blanco.png",
  "vendor/firebase-app-compat.js", "vendor/firebase-auth-compat.js", "vendor/firebase-firestore-compat.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
// Primero la red (para recibir actualizaciones), si no hay conexión usa la copia guardada.
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
