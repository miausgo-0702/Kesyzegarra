// Notificaciones del sistema: Android (puente nativo del APK) o navegador (PC / iPhone).
(function (G) {
  const A = G.AndroidApp;   // lo inyecta el APK
  const N = {
    nativo: !!A,
    estado() {
      if (A) return A.permiso();
      if ("Notification" in G) return Notification.permission;
      return "no-soportado";
    },
    async pedir() {
      if (A) { A.pedirPermiso(); return; }
      if ("Notification" in G && Notification.permission === "default") { try { await Notification.requestPermission(); } catch (e) {} }
    },
    async mostrar(id, titulo, texto) {
      if (A) { A.notificar(String(id), titulo, texto); return; }
      if (!("Notification" in G) || Notification.permission !== "granted") return;
      const op = { body: texto, tag: String(id), icon: "icons/icon-192.png", badge: "icons/icon-192.png", data: { url: "./#notificaciones" } };
      try {
        const r = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
        if (r) { await r.showNotification(titulo, op); return; }
      } catch (e) {}
      try { const n = new Notification(titulo, op); n.onclick = () => { G.focus(); G.abrirNotificaciones && G.abrirNotificaciones(); }; } catch (e) {}
    },
    /**
     * Token del dispositivo para recibir notificaciones push con la app cerrada.
     * Android: lo da el APK (Firebase Cloud Messaging nativo). PC / iPhone: Web Push del navegador.
     */
    async token() {
      if (A) {
        if (!A.tokenPush) return null;
        const t = A.tokenPush();
        if (t) return { token: t, plataforma: "android" };
        // el APK lo pide en segundo plano y avisa con window.__tokenPush
        return new Promise(res => { G.__tokenPush = x => res(x ? { token: x, plataforma: "android" } : null); setTimeout(() => res(null), 15000); });
      }
      try {
        if (!G.FIREBASE_CONFIG || !G.VAPID_KEY || !G.firebase || !firebase.messaging || !navigator.serviceWorker) return null;
        if (!(await firebase.messaging.isSupported())) return null;
        if (Notification.permission !== "granted") return null;
        const reg = await navigator.serviceWorker.ready;
        const t = await firebase.messaging().getToken({ vapidKey: G.VAPID_KEY, serviceWorkerRegistration: reg });
        return t ? { token: t, plataforma: "web" } : null;
      } catch (e) { console.warn("push web", e); return null; }
    },
    // el APK guarda la sesión para revisar cambios en segundo plano
    sesion(datos) { if (A) { try { A.guardarSesion(datos ? JSON.stringify(datos) : ""); } catch (e) {} } },
  };
  G.Notif = N;
})(window);
