// Prueba del asistente con un Claude SIMULADO (no llama a la API real ni gasta).
// Necesita el emulador de Firestore:  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node test/asistente.test.js
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-mishorarios";
const assert = require("assert");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: "demo-mishorarios" });
const db = admin.firestore();
const A = require("../asistente");
const H = require("../horarios");

/** Cliente falso con la misma forma que client.beta.* de Managed Agents. */
function falsoAnthropic(guion) {
  const historial = [], esperando = [];
  let cola = [], despertar = null, n = 0;
  const id = p => p + (++n);
  const emitir = ev => { ev.id = ev.id || id("sevt_"); historial.push(ev); cola.push(ev); if (despertar) { despertar(); despertar = null; } };
  const registro = { creados: { agentes: 0, entornos: 0, sesiones: 0, actualizados: 0 }, resultados: [] };
  async function correrGuion(texto) {
    for (const paso of guion(texto)) {
      if (paso.herramienta) {
        const ev = { type: "agent.custom_tool_use", name: paso.herramienta, input: paso.input };
        const r = new Promise(res => esperando.push({ id: null, res }));
        emitir(ev); esperando[esperando.length - 1].id = ev.id;
        emitir({ type: "session.status_idle", stop_reason: { type: "requires_action", event_ids: [ev.id] } });
        registro.resultados.push({ herramienta: paso.herramienta, resultado: await r });
      } else if (paso.texto) emitir({ type: "agent.message", content: [{ type: "text", text: paso.texto }] });
    }
    emitir({ type: "session.status_idle", stop_reason: { type: "end_turn" } });
  }
  return {
    registro,
    beta: {
      environments: { create: async () => { registro.creados.entornos++; return { id: "env_1" }; } },
      agents: {
        create: async c => { registro.creados.agentes++; registro.config = c; return { id: "agent_1", version: 1 }; },
        update: async () => { registro.creados.actualizados++; return { id: "agent_1", version: 2 }; },
      },
      sessions: {
        create: async p => { registro.creados.sesiones++; registro.sesion = p; return { id: id("sesn_") }; },
        events: {
          stream: async () => ({
            async *[Symbol.asyncIterator]() {
              while (true) {
                while (!cola.length) await new Promise(r => { despertar = r; });
                const ev = cola.shift(); yield ev;
              }
            },
          }),
          send: async (sid, { events }) => {
            const out = [];
            for (const e of events) {
              const ev = { ...e, id: id("sevt_") }; historial.push(ev); out.push(ev);
              if (e.type === "user.message") setTimeout(() => correrGuion(e.content.find(b => b.type === "text").text), 5);
              if (e.type === "user.custom_tool_result") {
                const w = esperando.find(x => x.id === e.custom_tool_use_id);
                if (w) { esperando.splice(esperando.indexOf(w), 1); w.res({ texto: e.content[0].text, error: !!e.is_error }); }
              }
            }
            return { data: out };
          },
          list: async function* () { for (const e of historial) yield e; },
        },
      },
    },
  };
}

(async () => {
  let ok = 0;
  await db.doc("iaConfig/agente").delete().catch(() => {});
  await db.doc("iaSesiones/adminPrueba").delete().catch(() => {});
  await db.doc("config/datos").set({ json: JSON.stringify(H.SEED), actualizado: 1 });
  for (const d of (await db.collection("cambios").get()).docs) await d.ref.delete();

  // 1) consulta + propuesta de franco; el agente se crea una sola vez
  const f1 = falsoAnthropic(texto => [
    { herramienta: "quien_trabaja", input: { fecha: "2026-11-28", sector: "Ventas" } },
    { herramienta: "proponer_cambio_turno", input: { persona: "pacheco", desde: "2026-12-03", trabaja: false, nota: "Pidió el día" } },
    { texto: "Este sábado en Ventas trabajan varios. Preparé el franco de Pacheco Julian para el jueves 3. ¿Lo aplico?" },
  ]);
  let r = await A.conversar({ anthropic: f1, db, uid: "adminPrueba", admin: "Lezana", mensaje: "¿Quién trabaja el sábado en ventas? Y dale franco a Pacheco el jueves 3", pendientes: 0 });
  assert.strictEqual(f1.registro.creados.agentes, 1); assert.strictEqual(f1.registro.creados.entornos, 1);
  assert.strictEqual(f1.registro.config.model.id, "claude-opus-5-5");
  assert(f1.registro.config.tools.every(t => t.type === "custom"));
  assert.deepStrictEqual(f1.registro.sesion.budget, { type: "limit", max_list_cost: { amount: "500", currency: "USD" } });
  const q = f1.registro.resultados[0].resultado.texto;
  assert(q.includes("fin de semana del Grupo B") && q.includes("Juan Renzo: 14 a 22"), q);
  assert(!q.includes("Silva Virginia"), "Silva es del Grupo A");
  assert.strictEqual(r.propuestas.length, 1);
  assert.strictEqual(r.propuestas[0].tipo, "cambio_turno");
  assert(r.propuestas[0].descripcion.startsWith("Pacheco Julian: franco jue 3 dic"), r.propuestas[0].descripcion);
  assert(r.texto.includes("¿Lo aplico?"));
  console.log("✓ consulta + propuesta:", r.propuestas[0].descripcion); ok++;

  // 2) la segunda vuelta reutiliza agente y sesión; "sí" -> confirmar
  const f2 = falsoAnthropic(() => [{ herramienta: "confirmar_propuestas", input: {} }, { texto: "Listo, aplicado." }]);
  r = await A.conversar({ anthropic: f2, db, uid: "adminPrueba", admin: "Lezana", mensaje: "sí", pendientes: 1 });
  assert.strictEqual(f2.registro.creados.agentes, 0); assert.strictEqual(f2.registro.creados.sesiones, 0);
  assert.strictEqual(r.confirmar, true);
  console.log("✓ confirmar por voz/texto: reutiliza agente y sesión"); ok++;

  // 3) errores útiles: persona ambigua y horario inválido vuelven al modelo como error
  const f3 = falsoAnthropic(() => [
    { herramienta: "proponer_cambio_turno", input: { persona: "coronel", desde: "2026-12-01", trabaja: true, horario: "8 a 16" } },
    { herramienta: "proponer_editar_planilla", input: { planilla: "semana", operaciones: [{ op: "horario", persona: "Rojas", horario: "temprano" }] } },
    { texto: "¿Cuál Coronel?" },
  ]);
  r = await A.conversar({ anthropic: f3, db, uid: "adminPrueba", admin: "Lezana", mensaje: "cambiale a coronel", pendientes: 0 });
  const [e1, e2] = f3.registro.resultados.map(x => x.resultado);
  assert(e1.error && e1.texto.includes("Coronel Aldana, Coronel Carla, Coronel Tamara"), e1.texto);
  assert(e2.error && e2.texto.includes("No entiendo el horario"), e2.texto);
  assert.strictEqual(r.propuestas.length, 0);
  console.log("✓ errores claros:", e1.texto.replace("Error: ", "")); ok++;

  // 4) cambio total: planilla nueva de finde + edición encadenada sobre el resultado
  const f4 = falsoAnthropic(() => [
    { herramienta: "proponer_reemplazar_planilla", input: { planilla: "B_sab", fecha_base: "2026-11-28", filas: [
      { sector: "Ventas", persona: "Juan Renzo", horario: "8 a 16" }, { sector: "Ventas", persona: "Mitre Florencia", horario: "16 a 00" },
      { sector: "Ventas", persona: "Lugones Maximiliano", horario: "23 a 07", fijo: true }] } },
    { herramienta: "proponer_editar_planilla", input: { planilla: "B_sab", operaciones: [{ op: "agregar", persona: "Gomez Lucia", sector: "Ventas", horario: "10 a 18", posicion: 2 }] } },
    { herramienta: "proponer_reemplazar_planilla", input: { planilla: "A_sab", fecha_base: "2026-11-28", filas: [{ sector: "Ventas", persona: "X Y", horario: "8 a 16" }] } },
    { texto: "Cargué la planilla nueva del Grupo B." },
  ]);
  r = await A.conversar({ anthropic: f4, db, uid: "adminPrueba", admin: "julianpz", mensaje: "te paso la planilla nueva", pendientes: 0 });
  assert.strictEqual(r.propuestas.length, 2, JSON.stringify(f4.registro.resultados));
  assert(f4.registro.resultados[2].resultado.error && f4.registro.resultados[2].resultado.texto.includes("trabaja el Grupo B, no el A"));
  // aplicar en orden como lo hace la app y comprobar el resultado con la lógica real
  let datos = H.SEED;
  for (const p of r.propuestas) datos = H.Acciones.aplicar(datos, { tipo: p.tipo, datos: p.datos }).datos;
  H.usarDatos(datos);
  assert.deepStrictEqual(datos.FINDE.B.sab.map(x => x[1]), ["Juan Renzo", "Gomez Lucia", "Mitre Florencia", "Lugones Maximiliano"]);
  assert.strictEqual(H.estado("Juan Renzo", H.L.parseYMD("2026-11-28"), []).h, "8 a 16");
  assert.strictEqual(H.estado("Juan Renzo", H.L.parseYMD("2026-12-12"), []).h, "10 a 18"); // rota un puesto
  assert.strictEqual(H.estado("Lugones Maximiliano", H.L.parseYMD("2026-12-12"), []).h, "23 a 07"); // fijo
  console.log("✓ cambio total de planilla + edición encadenada + validación de grupo"); ok++;

  // 5) imagen: se manda como bloque de imagen junto al texto
  let enviado = null;
  const f5 = falsoAnthropic(() => [{ texto: "Veo la planilla." }]);
  const send0 = f5.beta.sessions.events.send;
  f5.beta.sessions.events.send = async (sid, p) => { if (p.events[0].type === "user.message") enviado = p.events[0]; return send0(sid, p); };
  await A.conversar({ anthropic: f5, db, uid: "adminPrueba", admin: "Lezana", mensaje: "", imagenes: [{ tipo: "image/jpeg", datos: "AAAA" }], pendientes: 0 });
  assert.strictEqual(enviado.content[0].type, "image");
  assert.strictEqual(enviado.content[0].source.media_type, "image/jpeg");
  assert(enviado.content[1].text.startsWith("[Hoy es "));
  console.log("✓ foto de planilla enviada como imagen"); ok++;

  console.log("OK:", ok, "pruebas del asistente");
  process.exit(0);
})().catch(e => { console.error("FALLÓ:", e.stack || e.message); process.exit(1); });
