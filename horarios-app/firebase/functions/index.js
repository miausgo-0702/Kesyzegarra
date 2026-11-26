// Funciones en la nube de Mis Horarios: envían notificaciones push aunque la app esté cerrada.
//  - cambioNuevo:      un administrador carga un cambio  -> notificación al empleado
//  - cambioRespondido: el empleado acepta / rechaza       -> notificación a los administradores
//  - planillaNueva:    se guarda una planilla             -> a cada empleado con su horario
//  - resumenSemanal:   domingos 20 hs                     -> a cada empleado con su semana
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions, logger } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const H = require("./horarios");

admin.initializeApp();
setGlobalOptions({ region: "southamerica-east1", maxInstances: 3 });
const db = admin.firestore();

const ADMINS = ["lezana@admin.mishorarios.app", "julianpz@admin.mishorarios.app"];
const EMULADOR = process.env.FUNCTIONS_EMULATOR === "true";

/* ---------------- utilidades ---------------- */

async function datosActuales() {
  const d = await db.doc("config/datos").get();
  let datos = null;
  if (d.exists) { try { datos = JSON.parse(d.data().json); } catch (e) { datos = null; } }
  H.usarDatos(datos);
}

// Solo se envía una vez por clave (evita duplicados cuando un cambio tiene varios días).
async function unaVez(clave) {
  try { await db.doc("notifEnviadas/" + clave.replace(/[\/]/g, "_")).create({ t: Date.now() }); return true; }
  catch (e) { return false; }
}

async function uidsDePersona(persona) {
  const q = await db.collection("empleados").where("persona", "==", persona).get();
  return q.docs.map(d => d.id);
}
async function uidsAdmins() {
  const r = [];
  for (const e of ADMINS) { try { r.push((await admin.auth().getUserByEmail(e)).uid); } catch (er) { /* aún no creado */ } }
  return r;
}
async function tokensDe(uids) {
  if (!uids.length) return [];
  const r = [];
  for (let i = 0; i < uids.length; i += 30) {
    const q = await db.collection("tokens").where("uid", "in", uids.slice(i, i + 30)).get();
    q.docs.forEach(d => r.push({ token: d.data().token, plataforma: d.data().plataforma, ref: d.ref }));
  }
  return r;
}

/**
 * Envía a cada dispositivo. Android recibe un mensaje de datos (la app arma la notificación con
 * su estilo y botón "Ver y aprobar"); navegadores / iPhone reciben la notificación ya armada.
 */
async function enviar(destinos, { id, titulo, texto }) {
  if (!destinos.length) return 0;
  const msgs = destinos.map(d => d.plataforma === "android"
    ? { token: d.token, data: { id, titulo, texto }, android: { priority: "high", ttl: 86400000 * 3 } }
    : {
        token: d.token, data: { id },
        webpush: {
          headers: { Urgency: "high", TTL: String(86400 * 3) },
          notification: { title: titulo, body: texto, icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: id },
          fcmOptions: { link: "./#notificaciones" },
        },
      });
  if (EMULADOR) {
    // en pruebas locales no hay servidor de mensajería: se registra lo que se habría enviado
    await db.collection("_pruebaEnvios").add({ msgs: JSON.parse(JSON.stringify(msgs)), t: Date.now() });
    return msgs.length;
  }
  const res = await admin.messaging().sendEach(msgs);
  // borrar los dispositivos que ya no existen (app desinstalada, sesión cerrada, etc.)
  await Promise.all(res.responses.map((r, i) => {
    const c = r.error && r.error.code;
    if (c === "messaging/registration-token-not-registered" || c === "messaging/invalid-registration-token")
      return destinos[i].ref.delete().catch(() => {});
    if (r.error) logger.warn("Error al enviar", c);
    return null;
  }));
  return res.successCount;
}

/* ---------------- 1) cambio nuevo -> empleado ---------------- */
exports.cambioNuevo = onDocumentCreated("cambios/{id}", async ev => {
  const c = ev.data && ev.data.data(); if (!c || c.estado !== "pendiente") return;
  const lote = c.lote || ev.params.id;
  if (!(await unaVez("cambio_" + lote))) return;
  const cs = c.lote ? (await db.collection("cambios").where("lote", "==", c.lote).get()).docs.map(d => d.data()) : [c];
  const t = H.textoCambio(cs);
  const n = await enviar(await tokensDe(await uidsDePersona(c.persona)), {
    id: lote, titulo: "Cambio en tu horario",
    texto: `${t.cuando}: ${t.que}. Lo cargó ${c.por || "un administrador"}. Tocá para aprobarlo.${c.nota ? " Nota: " + c.nota : ""}`,
  });
  logger.info("cambioNuevo", { persona: c.persona, lote, enviados: n });
});

/* ---------------- 2) respuesta del empleado -> administradores ---------------- */
exports.cambioRespondido = onDocumentUpdated("cambios/{id}", async ev => {
  const a = ev.data.before.data(), d = ev.data.after.data();
  if (a.estado !== "pendiente" || d.estado === "pendiente") return;
  const lote = d.lote || ev.params.id;
  if (!(await unaVez(`resp_${lote}_${d.estado}`))) return;
  const cs = d.lote ? (await db.collection("cambios").where("lote", "==", d.lote).get()).docs.map(x => x.data()) : [d];
  const t = H.textoCambio(cs), ok = d.estado === "aceptado";
  await enviar(await tokensDe(await uidsAdmins()), {
    id: "r" + lote, titulo: `${d.persona} ${ok ? "aceptó" : "rechazó"} el cambio`,
    texto: `${t.cuando}: ${t.que}.${d.respuesta ? " Motivo: " + d.respuesta : ""}`,
  });
});

/* ---------------- 3) planilla nueva -> cada empleado con su horario ---------------- */
exports.planillaNueva = onDocumentWritten("config/datos", async ev => {
  const antes = ev.data.before.exists ? ev.data.before.data().json : null;
  const despues = ev.data.after.exists ? ev.data.after.data().json : null;
  if (!despues || antes === despues || antes === null) return; // la primera carga no se avisa
  // si un administrador guarda varias veces seguidas, se avisa como máximo cada 10 minutos
  const ref = db.doc("notifEnviadas/planilla");
  const ok = await db.runTransaction(async tx => {
    const s = await tx.get(ref);
    if (s.exists && Date.now() - s.data().t < 10 * 60000) return false;
    tx.set(ref, { t: Date.now() }); return true;
  });
  if (!ok) return;
  await datosActuales();
  const cambios = (await db.collection("cambios").get()).docs.map(d => d.data());
  let lunes = H.L.lunesDe(H.hoy());
  if (H.hoy().getDay() === 0 || H.hoy().getDay() === 6) lunes = H.L.addDays(lunes, 7);
  const emps = (await db.collection("empleados").get()).docs;
  for (const e of emps) {
    const r = H.resumenSemana(e.data().persona, lunes, cambios); if (!r) continue;
    await enviar(await tokensDe([e.id]), { id: "planilla_" + Date.now(), titulo: "📋 Se actualizó la planilla de horarios", texto: `${r.titulo}: ${r.texto}` });
  }
});

/* ---------------- 4) resumen semanal: domingos 20 hs ---------------- */
async function enviarResumenSemanal() {
  await datosActuales();
  const cambios = (await db.collection("cambios").get()).docs.map(d => d.data());
  const lunes = H.L.addDays(H.L.lunesDe(H.hoy()), H.hoy().getDay() === 0 ? 1 : 7);
  const emps = (await db.collection("empleados").get()).docs;
  let n = 0;
  for (const e of emps) {
    const r = H.resumenSemana(e.data().persona, lunes, cambios); if (!r) continue;
    n += await enviar(await tokensDe([e.id]), { id: "semana_" + H.L.ymd(lunes), titulo: `🗓 ${r.titulo} (${r.resumen})`, texto: r.texto });
  }
  logger.info("resumenSemanal", { lunes: H.L.ymd(lunes), enviados: n });
  return n;
}
exports.resumenSemanal = onSchedule({ schedule: "0 20 * * 0", timeZone: "America/Argentina/Buenos_Aires" }, enviarResumenSemanal);
exports._enviarResumenSemanal = enviarResumenSemanal; // para pruebas
