// IA en modo local (sin Firebase): el teléfono del administrador habla directo con Gemini.
// La clave de Gemini la pega el administrador en la app y queda guardada SOLO en ese dispositivo
// (localStorage). Usa las mismas instrucciones, herramientas y validaciones que el servidor
// (ia-herramientas.js + acciones.js); la IA nunca aplica cambios sola: deja propuestas.
(function (G) {
  "use strict";
  const L = G.L, IA = G.IA;
  const CLAVE = "mh_ia_gemini";
  const HIST = "mh_ia_hist_";
  const MODELOS = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"];
  const URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
  const PAUSA_MS = 10 * 60000, MAX_VUELTAS = 12, MAX_HISTORIAL = 40, DURACION_MS = 12 * 3600000;
  const MODELO_OK = "mh_ia_modelo";   // el último modelo que respondió bien: se prueba primero
  const pausados = new Map();
  try { const g = JSON.parse(localStorage.getItem("mh_ia_pausa") || "{}"); for (const k in g) if (g[k] > Date.now()) pausados.set(k, g[k]); } catch (e) {}
  const pausar = m => { pausados.set(m, Date.now() + PAUSA_MS); try { localStorage.setItem("mh_ia_pausa", JSON.stringify(Object.fromEntries(pausados))); } catch (e) {} };
  const esperar = ms => new Promise(r => setTimeout(r, ms));

  const leerClave = () => { try { return localStorage.getItem(CLAVE) || ""; } catch (e) { return ""; } };
  function guardarClave(k) {
    try { if (k) localStorage.setItem(CLAVE, String(k).trim()); else localStorage.removeItem(CLAVE); } catch (e) { throw new Error("No pude guardar la clave en este dispositivo."); }
  }

  function error(msg, codigo) { const e = new Error(msg); e.codigo = codigo; return e; }

  function conPlazo(ms) {
    if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) return { signal: AbortSignal.timeout(ms), fin() {} };
    const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
    return { signal: c.signal, fin() { clearTimeout(t); } };
  }

  /** generateContent con reintentos y cambio de modelo (igual que functions/gemini.js). */
  async function generar(cuerpo, opciones) {
    opciones = opciones || {};
    const clave = opciones.clave || leerClave();
    if (!clave) throw error("Falta la clave de Gemini. Pegala en el asistente o en Panel → Inteligencia artificial.", "sinClave");
    const fetchFn = opciones.fetch || G.fetch.bind(G);
    let pref = ""; try { pref = localStorage.getItem(MODELO_OK) || ""; } catch (e) {}
    const base = opciones.modelos || MODELOS;
    const orden = base.includes(pref) && !opciones.modelos ? [pref, ...base.filter(m => m !== pref)] : base;
    const libres = orden.filter(m => m === pref || !(pausados.get(m) > Date.now()));
    let ultimo = null;
    for (const modelo of libres.length ? libres : orden) {
      for (let intento = 0; intento < 2; intento++) {
        let r; const pl = conPlazo(opciones.plazo || 25000);
        try {
          r = await fetchFn(URL_BASE + modelo + ":generateContent", {
            method: "POST", headers: { "x-goog-api-key": clave, "Content-Type": "application/json" },
            body: JSON.stringify(cuerpo), signal: pl.signal,
          });
        } catch (e) {
          pl.fin();
          const tarde = e && (e.name === "TimeoutError" || e.name === "AbortError");
          ultimo = error(tarde ? "Gemini tardó demasiado." : "Sin conexión a internet (o Gemini no responde).", tarde ? "saturado" : "red");
          if (tarde) { pausar(modelo); break; }
          await esperar(800); continue;
        }
        pl.fin();
        let j = null; try { j = await r.json(); } catch (e) { j = null; }
        if (r.ok && j && j.candidates && j.candidates.length) { try { localStorage.setItem(MODELO_OK, modelo); } catch (e) {} pausados.delete(modelo); return { respuesta: j, modelo }; }
        const st = r.status, msg = (j && j.error && j.error.message) || `Gemini respondió ${st}`;
        if (st === 400 && /API key|API_KEY/i.test(msg)) throw error("La clave de Gemini no es válida. Revisala en Panel → Inteligencia artificial.", "clave");
        if (st === 401 || st === 403) throw error("La clave de Gemini no tiene permiso para este servicio.", "clave");
        if (r.ok && j && j.promptFeedback && j.promptFeedback.blockReason) throw error("Gemini no pudo procesar este pedido.", "bloqueado");
        ultimo = error(msg, st === 429 ? "cuota" : st === 503 ? "saturado" : "otro");
        if (st === 503 && intento === 0) { await esperar(1200); continue; }
        if (st === 503 || st === 429 || st === 404) pausar(modelo);
        break;
      }
    }
    if (ultimo && ultimo.codigo === "cuota") throw error("Gemini: se agotó la cuota gratuita por ahora. Probá en unos minutos.", "cuota");
    if (ultimo && ultimo.codigo === "saturado") throw error("Gemini está saturado en este momento. Probá de nuevo en un rato.", "saturado");
    throw ultimo || error("Gemini no respondió.");
  }
  const textoDe = j => ((j.candidates[0].content || {}).parts || []).filter(p => p.text && !p.thought).map(p => p.text).join("");

  function esquema(s) {
    if (Array.isArray(s)) return s.map(esquema);
    if (!s || typeof s !== "object") return s;
    const o = {}; for (const k in s) if (k !== "additionalProperties") o[k] = esquema(s[k]); return o;
  }
  let decl = null;
  const declaraciones = () => decl || (decl = IA.HERRAMIENTAS.map(h => ({ name: h.name, description: h.description, parametersJsonSchema: esquema(h.input_schema) })));

  function recortar(c) {
    if (c.length <= MAX_HISTORIAL) return c;
    let i = c.length - MAX_HISTORIAL;
    while (i < c.length && !(c[i].role === "user" && c[i].parts.some(p => p.text))) i++;
    return c.slice(i);
  }
  const sinFotos = c => ({ ...c, parts: c.parts.map(p => p.inlineData ? { text: "[foto enviada por el administrador]" } : p) });
  function leerHist(uid) {
    try { const h = JSON.parse(localStorage.getItem(HIST + uid) || "null"); if (h && Date.now() - h.t < DURACION_MS) return h.c || []; } catch (e) {}
    return [];
  }
  function guardarHist(uid, c) { try { localStorage.setItem(HIST + uid, JSON.stringify({ t: Date.now(), c })); } catch (e) { try { localStorage.removeItem(HIST + uid); } catch (x) {} } }
  function borrarHistorial(uid) { try { localStorage.removeItem(HIST + uid); } catch (e) {} }

  function ahoraArg() {
    try { return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })); } catch (e) { return new Date(); }
  }

  /** Una vuelta de conversación. ctx = { datos, cambios, empleados }. */
  async function conversar({ uid, admin, mensaje, imagenes, pendientes, ctx, opciones }) {
    const c = { datos: ctx.datos, cambios: ctx.cambios || [], empleados: ctx.empleados || [], propuestas: [], confirmar: false, descartar: false };
    const contents = leerHist(uid);
    const h = ahoraArg();
    const encabezado = `[Hoy es ${IA.DIAS[h.getDay()]} ${L.ymd(h)}, ${String(h.getHours()).padStart(2, "0")}:${String(h.getMinutes()).padStart(2, "0")} (Argentina). Habla: ${admin}. Propuestas sin confirmar en la app: ${pendientes || 0}.${(imagenes || []).length ? ` Fotos adjuntas: ${Math.min(4, imagenes.length)}.` : ""}]`;
    const nuevos = [{ role: "user", parts: [
      ...(imagenes || []).slice(0, 4).map(im => ({ inlineData: { mimeType: im.tipo, data: im.datos } })),
      { text: `${encabezado}\n\n${mensaje || "(foto adjunta)"}` },
    ] }];
    const textos = []; let nota = null;
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const { respuesta } = await generar({
        systemInstruction: { parts: [{ text: IA.SISTEMA }] },
        contents: [...contents, ...nuevos],
        tools: [{ functionDeclarations: declaraciones() }],
        generationConfig: { temperature: 0.4 },
      }, opciones);
      const cand = respuesta.candidates[0];
      const parts = (cand.content && cand.content.parts) || [];
      nuevos.push({ role: "model", parts });
      for (const p of parts) if (p.text && !p.thought) textos.push(p.text);
      const llamadas = parts.filter(p => p.functionCall);
      if (!llamadas.length) {
        if (cand.finishReason && !/STOP|MAX_TOKENS/.test(cand.finishReason) && !textos.length) nota = "Gemini no pudo responder este pedido. Probá decirlo de otra forma.";
        break;
      }
      nuevos.push({ role: "user", parts: llamadas.map(p => {
        const f = p.functionCall; let salida;
        try { salida = { resultado: IA.ejecutar(f.name, f.args || {}, c) }; } catch (e) { salida = { error: e.message }; }
        return { functionResponse: { name: f.name, ...(f.id ? { id: f.id } : {}), response: salida } };
      }) });
      if (vuelta === MAX_VUELTAS - 1) nota = "El pedido era muy largo; hice lo que pude. Revisá las propuestas.";
    }
    guardarHist(uid, recortar([...contents, ...nuevos.map(sinFotos)]));
    return {
      texto: textos.join("\n\n").trim() || (c.propuestas.length ? "Preparé los cambios. ¿Los aplico?" : "Listo."),
      nota, propuestas: c.propuestas, confirmar: c.confirmar, descartar: c.descartar,
    };
  }

  /** Lee fotos / PDF / texto de Excel o Word y devuelve las ofertas (formato fijo). */
  async function extraerOfertas(archivos, nota, opciones) {
    const hoy = L.ymd(ahoraArg());
    const parts = [];
    for (const a of archivos || []) {
      if (a.tipo === "imagen") parts.push({ inlineData: { mimeType: a.media, data: a.datos } });
      else if (a.tipo === "pdf") parts.push({ inlineData: { mimeType: "application/pdf", data: a.datos } });
      else if (a.tipo === "texto") parts.push({ text: `Archivo "${a.nombre || "sin nombre"}":\n${String(a.contenido).slice(0, 150000)}` });
    }
    parts.push({ text: IA.INSTRUCCIONES_OFERTAS(hoy, nota) });
    const { respuesta } = await generar({
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: IA.ESQUEMA_OFERTAS, temperature: 0.2 },
    }, Object.assign({ plazo: 120000 }, opciones));
    if (respuesta.candidates[0].finishReason === "MAX_TOKENS") throw error("Son demasiadas ofertas juntas. Probá subiendo los archivos de a uno.");
    let out; try { out = JSON.parse(textoDe(respuesta)); } catch (e) { throw error("La IA devolvió un formato inesperado. Probá de nuevo."); }
    const r2 = n => n == null || !isFinite(n) ? null : Math.round(n * 100) / 100;
    out.ofertas = (out.ofertas || []).slice(0, 60).map(o => {
      const x = { ...o, precio_antes: r2(o.precio_antes), precio_ahora: r2(o.precio_ahora), descuento_pct: o.descuento_pct == null ? null : Math.round(o.descuento_pct) };
      if (x.precio_antes && x.precio_ahora && x.precio_antes > x.precio_ahora && x.descuento_pct == null) x.descuento_pct = Math.round((1 - x.precio_ahora / x.precio_antes) * 100);
      if (x.precio_antes && x.descuento_pct && x.precio_ahora == null) x.precio_ahora = r2(x.precio_antes * (1 - x.descuento_pct / 100));
      return x;
    });
    out.advertencias = out.advertencias || []; out.resumen = out.resumen || "";
    return out;
  }

  /** Prueba la clave con un pedido mínimo (con el modelo más liviano: responde rápido aunque Gemini esté cargado). */
  async function probarClave(clave) {
    await generar({ contents: [{ role: "user", parts: [{ text: "Respondé solo: ok" }] }], generationConfig: { temperature: 0 } }, { clave, plazo: 15000, modelos: ["gemini-3.5-flash-lite", "gemini-flash-lite-latest", ...MODELOS.filter(m => !/lite/.test(m))] });
    return true;
  }

  G.IALocal = { leerClave, guardarClave, tieneClave: () => !!leerClave(), conversar, extraerOfertas, probarClave, borrarHistorial, generar, _pausados: pausados };
})(typeof window !== "undefined" ? window : globalThis);
