// Conector con la API de Gemini (Google AI Studio), por REST.
// Si un modelo está saturado (503), sin cuota (429) o no disponible (404), prueba con el siguiente.
// Orden por confiabilidad medida: 3.5 Flash responde rápido y estable; los demás quedan de respaldo.
const MODELOS = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"];
// Un modelo que falla (saturado, sin cuota o sin respuesta) queda en pausa unos minutos.
const PAUSA_MS = 10 * 60000;
const pausados = new Map();
const pausar = m => pausados.set(m, Date.now() + PAUSA_MS);
const disponible = m => !(pausados.get(m) > Date.now());
const URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

const esperar = ms => new Promise(r => setTimeout(r, ms));

class ErrorGemini extends Error {
  constructor(status, mensaje, codigo) { super(mensaje); this.status = status; this.codigo = codigo; }
}

/**
 * generateContent con reintentos y cambio de modelo.
 * cuerpo: { contents, systemInstruction?, tools?, generationConfig? }
 * Devuelve { respuesta, modelo }.
 */
async function generar(clave, cuerpo, opciones) {
  opciones = opciones || {};
  const todos = opciones.modelos || MODELOS;
  const modelos = todos.filter(disponible).length ? todos.filter(disponible) : todos;
  const fetchFn = opciones.fetch || fetch;
  let ultimo = null;
  for (const modelo of modelos) {
    for (let intento = 0; intento < 2; intento++) {
      let r;
      try {
        r = await fetchFn(URL_BASE + modelo + ":generateContent", {
          method: "POST",
          headers: { "x-goog-api-key": clave, "Content-Type": "application/json" },
          body: JSON.stringify(cuerpo),
          signal: AbortSignal.timeout(opciones.plazo || 30000),
        });
      } catch (e) {
        // sin respuesta a tiempo: no se espera de nuevo a este modelo
        ultimo = new ErrorGemini(e && e.name === "TimeoutError" ? 503 : 0, e && e.name === "TimeoutError" ? "Gemini tardó demasiado." : "Sin conexión con Gemini.", "saturado");
        if (e && e.name === "TimeoutError") { pausar(modelo); break; }
        await esperar(800); continue;
      }
      let j = null; try { j = await r.json(); } catch (e) { j = null; }
      if (r.ok && j && j.candidates && j.candidates.length) return { respuesta: j, modelo };
      const st = r.status, msg = (j && j.error && j.error.message) || `Gemini respondió ${st}`;
      if (st === 400 && /API key|API_KEY/i.test(msg)) throw new ErrorGemini(401, "La clave de Gemini no es válida.", "clave");
      if (st === 401 || st === 403) throw new ErrorGemini(st, "La clave de Gemini no tiene permiso para este servicio.", "clave");
      if (r.ok && j && j.promptFeedback && j.promptFeedback.blockReason) throw new ErrorGemini(200, "Gemini no pudo procesar este pedido.", "bloqueado");
      ultimo = new ErrorGemini(st, msg, st === 429 ? "cuota" : st === 503 ? "saturado" : "otro");
      if (st === 503 && intento === 0) { await esperar(1200); continue; }   // saturado: reintento una vez
      if (st === 503 || st === 429 || st === 404) pausar(modelo);
      break;                                                                 // siguiente modelo
    }
  }
  if (ultimo && ultimo.codigo === "cuota") throw new ErrorGemini(429, "Gemini: se agotó la cuota gratuita por ahora. Probá en unos minutos o activá la facturación en Google AI Studio.", "cuota");
  if (ultimo && ultimo.codigo === "saturado") throw new ErrorGemini(503, "Gemini está saturado en este momento. Probá de nuevo en un rato.", "saturado");
  throw ultimo || new ErrorGemini(500, "Gemini no respondió.");
}

const textoDe = j => ((j.candidates[0].content || {}).parts || []).filter(p => p.text && !p.thought).map(p => p.text).join("");

module.exports = { generar, textoDe, ErrorGemini, MODELOS, _pausados: pausados };
