// Asistente de IA para administradores (Claude, con Managed Agents).
// Anthropic aloja el agente y la conversación; las herramientas son "custom tools" que se
// ejecutan acá, en la función, contra los datos de Firestore:
//  - herramientas de consulta: responden con datos reales (horarios, planillas, cambios...)
//  - herramientas "proponer_*": validan la acción y la dejan como PROPUESTA; el administrador
//    la confirma en la app (botón Aplicar o diciendo "sí"). La IA nunca modifica datos sola.
const crypto = require("crypto");
const H = require("./horarios");
const { L, Acciones } = H;

const MODELO = { id: "claude-opus-5-5", effort: "medium" };
const MAX_SESION_USD_CENTAVOS = "500";      // tope de gasto por conversación: US$ 5
const DURACION_SESION_MS = 12 * 3600000;     // una conversación nueva cada 12 h
const PLAZO_MS = 240000;                     // tiempo máximo por mensaje

/* instrucciones y herramientas: web/ia-herramientas.js (compartido con la app) */
const { SISTEMA, HERRAMIENTAS, ejecutar, DIAS } = H.IA;

/** Datos actuales: planillas, cambios y empleados. */
async function cargarContexto(db) {
  const d = await db.doc("config/datos").get();
  let datos = null; if (d.exists) { try { datos = JSON.parse(d.data().json); } catch (e) { datos = null; } }
  const cambios = (await db.collection("cambios").get()).docs.map(x => ({ id: x.id, ...x.data() }));
  const empleados = (await db.collection("empleados").get()).docs.map(x => ({ id: x.id, ...x.data() }));
  return { datos: datos || L.getData(), cambios, empleados, propuestas: [], confirmar: false, descartar: false };
}
/* ======================= agente y entorno (se crean una sola vez) ======================= */
const CONFIG_AGENTE = {
  name: "Asistente Mis Horarios",
  description: "Asistente de administración de horarios de las farmacias La Esquina y Belgrano.",
  model: MODELO,
  system: SISTEMA,
  tools: HERRAMIENTAS.map(t => ({ type: "custom", ...t })),
};
const HASH = crypto.createHash("sha256").update(JSON.stringify(CONFIG_AGENTE)).digest("hex").slice(0, 16);

async function asegurarAgente(anthropic, db) {
  const ref = db.doc("iaConfig/agente");
  let c = (await ref.get()).data();
  if (!c) {
    // evita que dos llamadas simultáneas creen dos agentes
    const lock = db.doc("iaConfig/creando");
    try { await lock.create({ t: Date.now() }); }
    catch (e) {
      for (let i = 0; i < 30 && !c; i++) { await new Promise(r => setTimeout(r, 1000)); c = (await ref.get()).data(); }
      if (c) return c;
      throw new Error("El asistente se está configurando. Probá de nuevo en un minuto.");
    }
    try {
      const env = await anthropic.beta.environments.create({
        name: "mis-horarios",
        config: { type: "cloud", networking: { type: "limited", allow_package_managers: false, allow_mcp_servers: false } },
      });
      const agent = await anthropic.beta.agents.create(CONFIG_AGENTE);
      c = { agentId: agent.id, agentVersion: agent.version, environmentId: env.id, hash: HASH, creado: Date.now() };
      await ref.set(c);
    } finally { await lock.delete().catch(() => {}); }
  } else if (c.hash !== HASH) {
    // cambiaron las instrucciones o las herramientas: se actualiza el mismo agente (nueva versión)
    const agent = await anthropic.beta.agents.update(c.agentId, CONFIG_AGENTE);
    c = { ...c, agentVersion: agent.version, hash: HASH, actualizado: Date.now() };
    await ref.set(c);
  }
  return c;
}

/* ======================= una vuelta de conversación ======================= */
const ahoraArg = () => new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));

async function conversar({ anthropic, db, uid, admin, mensaje, imagenes, nueva, pendientes }) {
  const cfg = await asegurarAgente(anthropic, db);
  const sref = db.doc("iaSesiones/" + uid);
  let ses = (await sref.get()).data();
  if (nueva || !ses || Date.now() - ses.creado > DURACION_SESION_MS || ses.renovar || ses.agentVersion !== cfg.agentVersion) {
    const s = await anthropic.beta.sessions.create({
      agent: { type: "agent", id: cfg.agentId, version: cfg.agentVersion },
      environment_id: cfg.environmentId,
      title: `Asistente · ${admin}`,
      budget: { type: "limit", max_list_cost: { amount: MAX_SESION_USD_CENTAVOS, currency: "USD" } },
    });
    ses = { sessionId: s.id, creado: Date.now(), agentVersion: cfg.agentVersion };
    await sref.set(ses);
  }
  const sid = ses.sessionId, ctx = await cargarContexto(db);
  const h = ahoraArg();
  const encabezado = `[Hoy es ${DIAS[h.getDay()]} ${L.ymd(h)}, ${String(h.getHours()).padStart(2, "0")}:${String(h.getMinutes()).padStart(2, "0")} (Argentina). Habla: ${admin}. Propuestas sin confirmar en la app: ${pendientes || 0}.]`;
  const contenido = [
    ...(imagenes || []).slice(0, 4).map(im => ({ type: "image", source: { type: "base64", media_type: im.tipo, data: im.datos } })),
    { type: "text", text: `${encabezado}\n\n${mensaje || "(foto adjunta)"}` },
  ];

  const textos = [], vistos = new Set(), respondidos = new Set();
  const limite = Date.now() + PLAZO_MS;
  let fin = false, nota = null, idMensaje = null;

  async function procesar(ev) {
    if (vistos.has(ev.id)) return; vistos.add(ev.id);
    switch (ev.type) {
      case "agent.message":
        for (const b of ev.content || []) if (b.type === "text" && b.text) textos.push(b.text);
        break;
      case "user.custom_tool_result": respondidos.add(ev.custom_tool_use_id); break;
      case "agent.custom_tool_use": {
        if (respondidos.has(ev.id)) break;
        respondidos.add(ev.id);
        let texto, error = false;
        try { texto = ejecutar(ev.name, ev.input || {}, ctx); }
        catch (e) { texto = "Error: " + e.message; error = true; }
        await anthropic.beta.sessions.events.send(sid, { events: [{ type: "user.custom_tool_result", custom_tool_use_id: ev.id, is_error: error, content: [{ type: "text", text: String(texto).slice(0, 60000) }] }] });
        break;
      }
      case "session.status_idle": {
        const r = ev.stop_reason && ev.stop_reason.type;
        if (r === "requires_action") break;
        if (r === "budget_reached") { nota = "Esta conversación llegó a su tope de gasto. La próxima pregunta empieza una conversación nueva."; await sref.update({ renovar: true }); }
        fin = true; break;
      }
      case "session.status_terminated": fin = true; await sref.update({ renovar: true }); nota = nota || "La conversación se cerró. Escribí de nuevo para empezar otra."; break;
      default: break;
    }
  }

  // stream primero, después el mensaje (así no se pierden eventos)
  let stream = await anthropic.beta.sessions.events.stream(sid);
  const enviado = await anthropic.beta.sessions.events.send(sid, { events: [{ type: "user.message", content: contenido }] });
  idMensaje = enviado && enviado.data && enviado.data[0] && enviado.data[0].id;

  for (let intento = 0; !fin && intento < 4; intento++) {
    try {
      for await (const ev of stream) {
        await procesar(ev);
        if (fin) break;
        if (Date.now() > limite) {
          await anthropic.beta.sessions.events.send(sid, { events: [{ type: "user.interrupt" }] }).catch(() => {});
          nota = "Tardó demasiado y lo interrumpí. Probá con un pedido más corto."; fin = true; break;
        }
      }
      if (!fin) throw new Error("stream cerrado");
    } catch (e) {
      if (fin) break;
      // reconexión: abrir stream nuevo y repasar el historial desde nuestro mensaje (sin repetir eventos)
      stream = await anthropic.beta.sessions.events.stream(sid);
      let despues = !idMensaje;
      for await (const ev of anthropic.beta.sessions.events.list(sid)) {
        if (!despues) { if (ev.id === idMensaje) despues = true; continue; }
        await procesar(ev); if (fin) break;
      }
    }
  }
  if (!fin && !nota) nota = "Se cortó la conexión con el asistente. Probá de nuevo.";
  return {
    texto: textos.join("\n\n").trim() || (ctx.propuestas.length ? "Preparé los cambios. ¿Los aplico?" : "Listo."),
    nota, propuestas: ctx.propuestas, confirmar: ctx.confirmar, descartar: ctx.descartar, sesion: sid,
  };
}

module.exports = { conversar, ejecutar, cargarContexto, asegurarAgente, HERRAMIENTAS, SISTEMA, CONFIG_AGENTE };
