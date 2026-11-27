// Asistente de IA para administradores con Gemini (alternativa a Claude).
// Mismas instrucciones, herramientas y validaciones que asistente.js; el ciclo de herramientas
// corre acá y la conversación de cada administrador se guarda en Firestore (iaGemini/{uid}).
const A = require("./asistente");
const G = require("./gemini");
const { L } = require("./horarios");

const MAX_VUELTAS = 12;             // rondas de herramientas por mensaje
const MAX_HISTORIAL = 60;           // mensajes que se recuerdan
const DURACION_MS = 12 * 3600000;   // conversación nueva cada 12 h
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// Gemini no acepta "additionalProperties" ni tipos ["x","null"] en todas las versiones: se limpian.
function esquemaGemini(s) {
  if (Array.isArray(s)) return s.map(esquemaGemini);
  if (!s || typeof s !== "object") return s;
  const o = {};
  for (const [k, v] of Object.entries(s)) { if (k === "additionalProperties") continue; o[k] = esquemaGemini(v); }
  return o;
}
const DECLARACIONES = A.HERRAMIENTAS.map(h => ({ name: h.name, description: h.description, parametersJsonSchema: esquemaGemini(h.input_schema) }));

// Recorta el historial empezando siempre en un mensaje de texto del administrador (no corta pares
// de llamada / respuesta de herramienta).
function recortar(contents) {
  if (contents.length <= MAX_HISTORIAL) return contents;
  let i = contents.length - MAX_HISTORIAL;
  while (i < contents.length && !(contents[i].role === "user" && contents[i].parts.some(p => p.text))) i++;
  return contents.slice(i);
}
// No guardar fotos en el historial (pesan mucho): se reemplazan por una nota.
const sinFotos = c => ({ ...c, parts: c.parts.map(p => p.inlineData ? { text: "[foto enviada por el administrador]" } : p) });

async function conversarGemini({ clave, db, uid, admin, mensaje, imagenes, nueva, pendientes, opciones }) {
  const ref = db.doc("iaGemini/" + uid);
  const doc = (await ref.get()).data();
  let contents = [];
  if (!nueva && doc && Date.now() - (doc.actualizado || 0) < DURACION_MS) { try { contents = JSON.parse(doc.json); } catch (e) { contents = []; } }

  const ctx = await A.cargarContexto(db);
  const h = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const encabezado = `[Hoy es ${DIAS[h.getDay()]} ${L.ymd(h)}, ${String(h.getHours()).padStart(2, "0")}:${String(h.getMinutes()).padStart(2, "0")} (Argentina). Habla: ${admin}. Propuestas sin confirmar en la app: ${pendientes || 0}.]`;
  const turno = { role: "user", parts: [
    ...(imagenes || []).slice(0, 4).map(im => ({ inlineData: { mimeType: im.tipo, data: im.datos } })),
    { text: `${encabezado}\n\n${mensaje || "(foto adjunta)"}` },
  ] };
  const nuevos = [turno];
  const textos = [];
  let nota = null;

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const { respuesta } = await G.generar(clave, {
      systemInstruction: { parts: [{ text: A.SISTEMA }] },
      contents: [...contents, ...nuevos],
      tools: [{ functionDeclarations: DECLARACIONES }],
      generationConfig: { temperature: 0.3 },
    }, opciones);
    const cand = respuesta.candidates[0];
    const parts = (cand.content && cand.content.parts) || [];
    nuevos.push({ role: "model", parts });   // se guarda tal cual (incluye thoughtSignature)
    for (const p of parts) if (p.text && !p.thought) textos.push(p.text);
    const llamadas = parts.filter(p => p.functionCall);
    if (!llamadas.length) {
      if (cand.finishReason && !/STOP|MAX_TOKENS/.test(cand.finishReason) && !textos.length) nota = "Gemini no pudo responder este pedido. Probá decirlo de otra forma.";
      break;
    }
    const resultados = llamadas.map(p => {
      const f = p.functionCall;
      let salida;
      try { salida = { resultado: A.ejecutar(f.name, f.args || {}, ctx) }; }
      catch (e) { salida = { error: e.message }; }
      return { functionResponse: { name: f.name, ...(f.id ? { id: f.id } : {}), response: salida } };
    });
    nuevos.push({ role: "user", parts: resultados });
    if (vuelta === MAX_VUELTAS - 1) nota = "El pedido era muy largo; hice lo que pude. Revisá las propuestas.";
  }

  const guardado = recortar([...contents, ...nuevos.map(sinFotos)]);
  await ref.set({ json: JSON.stringify(guardado), actualizado: Date.now() });
  return {
    texto: textos.join("\n\n").trim() || (ctx.propuestas.length ? "Preparé los cambios. ¿Los aplico?" : "Listo."),
    nota, propuestas: ctx.propuestas, confirmar: ctx.confirmar, descartar: ctx.descartar,
  };
}

module.exports = { conversarGemini, DECLARACIONES, esquemaGemini };
