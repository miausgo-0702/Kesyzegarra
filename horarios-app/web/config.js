// Configuración de Mis Horarios.
//
// MODO ONLINE (recomendado): pegá acá la configuración web de tu proyecto de Firebase
// (Consola de Firebase > Configuración del proyecto > Tus apps > App web > firebaseConfig).
// Con eso todos los empleados y administradores comparten los mismos datos.
// Ver GUIA_FIREBASE.md.
//
// Si queda en null, la app funciona en MODO LOCAL: todo se guarda solo en ese dispositivo.
// (Se usa "self" para que también lo lea el service worker de las notificaciones.)
self.FIREBASE_CONFIG = null;

// Administradores. No figuran en ninguna lista de empleados.
// En modo online, sus cuentas (con su clave) se crean en Firebase Authentication con estos correos:
// las claves NO se guardan en el código.
// En modo local (sin Firebase) la clave se valida con admins.local.js, que no se sube al repositorio.
self.ADMINS = {
  // nombreCompleto: para el saludo del asistente de IA. Si falta, la IA lo pregunta la primera vez.
  lezana:   { nombre: "Lezana",   email: "lezana@admin.mishorarios.app",   nombreCompleto: null },
  julianpz: { nombre: "julianpz", email: "julianpz@admin.mishorarios.app", nombreCompleto: "Julián Pacheco" },
};
self.DOMINIO_EMPLEADOS = "empleados.mishorarios.app";

// Notificaciones push en PC / iPhone: clave pública "Web Push" del proyecto
// (Firebase > Configuración del proyecto > Cloud Messaging > Certificados web push).
self.VAPID_KEY = null;
