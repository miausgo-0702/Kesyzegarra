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
    // el APK guarda la sesión para revisar cambios en segundo plano
    sesion(datos) { if (A) { try { A.guardarSesion(datos ? JSON.stringify(datos) : ""); } catch (e) {} } },
  };
  G.Notif = N;
})(window);
