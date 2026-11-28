// Prueba de las funciones con el emulador de Firebase (no usa datos ni claves reales):
//   firebase emulators:exec --only auth,firestore,functions --project demo-mishorarios "npm --prefix functions test"
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.GCLOUD_PROJECT = "demo-mishorarios";
process.env.FUNCTIONS_EMULATOR = "true";
const assert = require("assert");
const funciones = require("../index.js");
const H = require("../horarios");
const admin = require("firebase-admin");
const db = admin.firestore();
const espera = ms => new Promise(r => setTimeout(r, ms));
const CLAVE_PRUEBA = "clave-de-prueba-123";

async function envios(desde) {
  const q = await db.collection("_pruebaEnvios").where("t", ">", desde).get();
  return q.docs.map(d => d.data().msgs).flat();
}
async function esperarEnvios(desde, n, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const e = await envios(desde); if (e.length >= n) return e; await espera(400); }
  return envios(desde);
}

(async () => {
  let ok = 0;
  const crear = async email => {
    try { return (await admin.auth().createUser({ email, password: CLAVE_PRUEBA })).uid; }
    catch (e) { return (await admin.auth().getUserByEmail(email)).uid; }
  };
  const adm = await crear("lezana@admin.mishorarios.app");
  const emp = await crear("35111222@empleados.mishorarios.app");
  const otro = await crear("40999888@empleados.mishorarios.app");
  await db.doc("empleados/" + emp).set({ dni: "35111222", persona: "Pacheco Julian", creado: 1 });
  await db.doc("empleados/" + otro).set({ dni: "40999888", persona: "Rojas Yohana", creado: 1 });
  await db.doc("tokens/tokEmpAndroid").set({ uid: emp, token: "tokEmpAndroid", plataforma: "android", actualizado: 1 });
  await db.doc("tokens/tokEmpWeb").set({ uid: emp, token: "tokEmpWeb", plataforma: "web", actualizado: 1 });
  await db.doc("tokens/tokOtro").set({ uid: otro, token: "tokOtro", plataforma: "android", actualizado: 1 });
  await db.doc("tokens/tokAdmin").set({ uid: adm, token: "tokAdmin", plataforma: "web", actualizado: 1 });

  // 1) cambio de 2 días -> una sola notificación por dispositivo del empleado
  let t = Date.now();
  const b = db.batch(), lote = "Ltest" + t;
  ["2026-11-28", "2026-11-29"].forEach(f => b.set(db.collection("cambios").doc(),
    { persona: "Pacheco Julian", fecha: f, t: true, h: "15 a 23", nota: "Cubrís a Rojas", por: "Lezana", estado: "pendiente", lote, creado: t }));
  await b.commit();
  await esperarEnvios(t, 2); await espera(2500);
  let e = await envios(t);
  assert.strictEqual(e.length, 2, "una notificación por dispositivo: " + JSON.stringify(e));
  assert.deepStrictEqual(e.map(m => m.token).sort(), ["tokEmpAndroid", "tokEmpWeb"]);
  const and = e.find(m => m.token === "tokEmpAndroid");
  assert.strictEqual(and.data.titulo, "Cambio en tu horario");
  assert(and.data.texto.startsWith("Del 28 nov al 29 nov: trabajás 15 a 23. Lo cargó Lezana."), and.data.texto);
  assert.strictEqual(and.android.priority, "high");
  assert.strictEqual(e.find(m => m.token === "tokEmpWeb").webpush.notification.title, "Cambio en tu horario");
  console.log("✓ cambio nuevo:", and.data.texto); ok++;

  // 2) el empleado rechaza -> notificación a los administradores
  t = Date.now();
  const cs = await db.collection("cambios").where("lote", "==", lote).get();
  const b2 = db.batch(); cs.docs.forEach(d => b2.update(d.ref, { estado: "rechazado", respuesta: "Tengo turno médico", respondido: t })); await b2.commit();
  await esperarEnvios(t, 1); await espera(2500);
  e = await envios(t);
  assert.strictEqual(e.length, 1, JSON.stringify(e));
  assert.strictEqual(e[0].token, "tokAdmin");
  assert.strictEqual(e[0].webpush.notification.title, "Pacheco Julian rechazó el cambio");
  assert(e[0].webpush.notification.body.includes("Motivo: Tengo turno médico"));
  console.log("✓ respuesta:", e[0].webpush.notification.title, "·", e[0].webpush.notification.body); ok++;

  // 3) planilla nueva -> cada empleado con su horario (la primera carga no se avisa)
  await db.doc("config/datos").set({ json: JSON.stringify(H.SEED), actualizado: 1 });
  await espera(3000);
  t = Date.now();
  const d2 = JSON.parse(JSON.stringify(H.SEED)); d2.BASE_LUNES = "2026-12-07";
  await db.doc("config/datos").set({ json: JSON.stringify(d2), actualizado: 2 });
  await esperarEnvios(t, 3); await espera(2000);
  e = await envios(t);
  const pa = e.find(m => m.token === "tokEmpAndroid"), ro = e.find(m => m.token === "tokOtro");
  assert(pa && ro, JSON.stringify(e));
  assert.strictEqual(pa.data.titulo, "📋 Se actualizó la planilla de horarios");
  assert(!e.some(m => m.token === "tokAdmin"), "los administradores no reciben planilla personal");
  console.log("✓ planilla nueva:", pa.data.texto.slice(0, 110) + "…"); ok++;

  // 4) resumen semanal (lo que se manda los domingos a las 20 hs)
  t = Date.now();
  const n = await funciones._enviarResumenSemanal();
  e = await envios(t);
  assert.strictEqual(n, 3);
  const r = e.find(m => m.token === "tokOtro");
  assert(r.data.titulo.startsWith("🗓 Tu semana del"), r.data.titulo);
  console.log("✓ resumen semanal:", r.data.titulo, "→", r.data.texto.slice(0, 90) + "…"); ok++;

  console.log("OK:", ok, "pruebas de funciones");
  process.exit(0);
})().catch(e => { console.error("FALLÓ:", e.message); process.exit(1); });
