// Service worker: permite abrir la app sin conexión (PC / iPhone instalados desde el navegador).
// Notificaciones push (PC / iPhone): Firebase Cloud Messaging muestra la notificación
// aunque la app esté cerrada.
try {
  importScripts("vendor/firebase-app-compat.js", "vendor/firebase-messaging-compat.js", "config.js");
  if (self.FIREBASE_CONFIG && self.VAPID_KEY && !self.FIREBASE_CONFIG.emulador) {
    firebase.initializeApp(self.FIREBASE_CONFIG);
    firebase.messaging();
  }
} catch (e) { /* sin push: la app sigue funcionando */ }

const CACHE = "mh-v11";
const ARCHIVOS = ["./", "index.html", "styles.css", "app.js", "logic.js", "backend.js", "notif.js", "acciones.js", "voz.js", "components/ui/live-orb.js", "components/ui/sun-moon-theme-toggle.js", "data.js", "config.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "img/logo.svg", "img/la-esquina.png", "img/la-esquina-blanco.png", "img/belgrano.png", "img/belgrano-blanco.png",
  "vendor/firebase-app-compat.js", "vendor/firebase-auth-compat.js", "vendor/firebase-firestore-compat.js", "vendor/firebase-messaging-compat.js", "vendor/firebase-functions-compat.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
// Primero la red (para recibir actualizaciones), si no hay conexión usa la copia guardada.
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});

// Al tocar una notificación se abre (o enfoca) la app en el panel de notificaciones.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./#notificaciones", self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ("focus" in c) { c.postMessage({ abrir: "notificaciones" }); return c.focus(); } }
    return clients.openWindow(url);
  }));
});
