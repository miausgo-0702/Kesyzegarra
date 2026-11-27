// Prueba del asistente y de las ofertas con un Gemini SIMULADO (no usa la API real ni ninguna clave).
// Necesita el emulador de Firestore:  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node test/gemini.test.js
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-mishorarios";
const assert = require("assert");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp({ projectId: "demo-mishorarios" });
const db = admin.firestore();
const G = require("../gemini");
const AG = require("../asistente-gemini");
const O = require("../ofertas");
const H = require("../horarios");

const resp = (status, cuerpo) => ({ ok: status === 200, status, json: async () => cuerpo });
const candidato = parts => ({ candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }] });

(async () => {
  let ok = 0;
  G._pausados.clear();

  // 1) cambio de modelo: saturado (503 x2) -> sin cuota (429) -> responde el tercero; los que fallaron quedan en pausa
  const vistos = [];
  const f1 = async (u, o) => {
    const m = u.split("/models/")[1].split(":")[0]; vistos.push(m);
    assert.strictEqual(o.headers["x-goog-api-key"], "CLAVE-FALSA");      // la clave va en el encabezado, no en la URL
    assert(!u.includes("CLAVE-FALSA"));
    if (m === "gemini-3.5-flash") return resp(503, { error: { message: "overloaded" } });
    if (m === "gemini-flash-latest") return resp(429, { error: { message: "quota" } });
    return resp(200, candidato([{ text: "ok" }]));
  };
  let r = await G.generar("CLAVE-FALSA", { contents: [] }, { fetch: f1 });
  assert.deepStrictEqual(vistos, ["gemini-3.5-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-3.8-flash"]);
  assert.strictEqual(r.modelo, "gemini-3.8-flash");
  vistos.length = 0;
  await G.generar("CLAVE-FALSA", { contents: [] }, { fetch: f1 });
  assert.deepStrictEqual(vistos, ["gemini-3.8-flash"], "los modelos que fallaron quedan en pausa");
  G._pausados.clear();
  await assert.rejects(G.generar("X", { contents: [] }, { fetch: async () => resp(400, { error: { message: "API key not valid" } }) }), /clave de Gemini no es válida/);
  await assert.rejects(G.generar("X", { contents: [] }, { fetch: async () => resp(429, { error: { message: "quota" } }) }), /cuota/);
  G._pausados.clear();
  console.log("✓ cambio de modelo, pausa de modelos que fallan y errores claros"); ok++;

  // 2) asistente: llamada a herramienta -> respuesta -> texto; historial sin fotos y con la firma de Gemini
  await db.doc("config/datos").set({ json: JSON.stringify(H.SEED), actualizado: 1 });
  await db.doc("iaGemini/gtest").delete().catch(() => {});
  const pedidos = [];
  const f2 = async (u, o) => {
    const b = JSON.parse(o.body); pedidos.push(b);
    const ult = b.contents[b.contents.length - 1];
    if (ult.parts.some(p => p.text && /franco/.test(p.text)))
      return resp(200, candidato([{ functionCall: { id: "c1", name: "proponer_cambio_turno", args: { persona: "pacheco", desde: "2026-12-03", trabaja: false } }, thoughtSignature: "FIRMA" }]));
    if (ult.parts.some(p => p.functionResponse)) return resp(200, candidato([{ text: "Preparé el franco de Pacheco. ¿Lo aplico?" }]));
    return resp(200, candidato([{ text: "?" }]));
  };
  r = await AG.conversarGemini({ clave: "X", db, uid: "gtest", admin: "Julián Pacheco", mensaje: "dale franco a pacheco el 3", imagenes: [{ tipo: "image/jpeg", datos: "AAAA" }], pendientes: 0, opciones: { fetch: f2 } });
  assert.strictEqual(r.propuestas.length, 1);
  assert(r.propuestas[0].descripcion.startsWith("Pacheco Julian: franco jue 3 dic"));
  assert.strictEqual(r.texto, "Preparé el franco de Pacheco. ¿Lo aplico?");
  const p1 = pedidos[0];
  assert(p1.systemInstruction.parts[0].text.includes("Mis Horarios"));
  assert(p1.tools[0].functionDeclarations.some(d => d.name === "quien_trabaja"));
  assert(!JSON.stringify(p1.tools).includes("additionalProperties"));
  assert.strictEqual(p1.contents[0].parts[0].inlineData.mimeType, "image/jpeg");
  const fr = pedidos[1].contents[2].parts[0].functionResponse;
  assert.strictEqual(fr.id, "c1"); assert(fr.response.resultado.includes("Propuesta preparada"));
  assert.strictEqual(pedidos[1].contents[1].parts[0].thoughtSignature, "FIRMA");
  const guardado = JSON.parse((await db.doc("iaGemini/gtest").get()).data().json);
  assert(!JSON.stringify(guardado).includes("inlineData"), "las fotos no se guardan en el historial");
  assert(JSON.stringify(guardado).includes("FIRMA"));
  console.log("✓ asistente: herramienta, respuesta, firma conservada e historial sin fotos"); ok++;

  // 3) segunda vuelta: usa el historial y el "sí" confirma
  const f3 = async (u, o) => {
    const b = JSON.parse(o.body);
    assert(b.contents.length >= 4, "se manda el historial");
    const ult = b.contents[b.contents.length - 1];
    if (ult.parts.some(p => p.functionResponse)) return resp(200, candidato([{ text: "Listo, aplicado." }]));
    return resp(200, candidato([{ functionCall: { name: "confirmar_propuestas", args: {} } }]));
  };
  r = await AG.conversarGemini({ clave: "X", db, uid: "gtest", admin: "Julián Pacheco", mensaje: "sí", pendientes: 1, opciones: { fetch: f3 } });
  assert.strictEqual(r.confirmar, true);
  console.log("✓ confirmar con historial"); ok++;

  // 4) ofertas con Gemini: formato fijo y normalización
  let cuerpo = null;
  const f4 = async (u, o) => { cuerpo = JSON.parse(o.body); return resp(200, candidato([{ text: JSON.stringify({ resumen: "1 oferta", advertencias: [], ofertas: [{ producto: "Ibupirac 400", presentacion: null, marca: null, categoria: "Medicamentos", precio_antes: 12500, precio_ahora: 9375, descuento_pct: null, condicion: null, vigencia_desde: null, vigencia_hasta: null, busqueda_imagen: "Ibupirac" }] }) }])); };
  const of = await O.extraerGemini("X", [{ tipo: "pdf", datos: "JVBER" }, { tipo: "texto", contenido: "a,b", nombre: "x.xlsx" }], "", { fetch: f4 });
  assert.strictEqual(cuerpo.generationConfig.responseMimeType, "application/json");
  assert(cuerpo.generationConfig.responseJsonSchema.properties.ofertas);
  assert.strictEqual(cuerpo.contents[0].parts[0].inlineData.mimeType, "application/pdf");
  assert.strictEqual(of.ofertas[0].descuento_pct, 25);
  console.log("✓ ofertas con Gemini"); ok++;

  console.log("OK:", ok, "pruebas de Gemini");
  process.exit(0);
})().catch(e => { console.error("FALLÓ:", e.stack || e.message); process.exit(1); });
