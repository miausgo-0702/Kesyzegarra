// Prueba de la lectura de ofertas con un Claude SIMULADO (no llama a la API real ni gasta).
//   node test/ofertas.test.js
const assert = require("assert");
const O = require("../ofertas");

(async () => {
  let ok = 0, pedido = null;
  const falso = respuesta => ({ beta: { messages: { create: async p => { pedido = p; return respuesta; } } } });

  // 1) forma del pedido y normalización de la respuesta
  const resp = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({
    resumen: "3 ofertas", advertencias: [],
    ofertas: [
      { producto: "Ibupirac 400", presentacion: "20 comp.", marca: "Pfizer", categoria: "Medicamentos", precio_antes: 12500, precio_ahora: 9375, descuento_pct: null, condicion: null, vigencia_desde: null, vigencia_hasta: "2026-12-31", busqueda_imagen: "Ibupirac 400 caja" },
      { producto: "Cetaphil", presentacion: null, marca: null, categoria: "Dermocosmética", precio_antes: 38900, precio_ahora: null, descuento_pct: 30, condicion: null, vigencia_desde: null, vigencia_hasta: null, busqueda_imagen: "Cetaphil" },
      { producto: "Pampers", presentacion: null, marca: null, categoria: "Bebés", precio_antes: null, precio_ahora: null, descuento_pct: null, condicion: "2x1", vigencia_desde: null, vigencia_hasta: null, busqueda_imagen: "Pampers" },
    ] }) }] };
  const r = await O.extraer(falso(resp), [
    { tipo: "imagen", media: "image/jpeg", datos: "AAAA" },
    { tipo: "pdf", datos: "JVBERi0=", nombre: "lista.pdf" },
    { tipo: "texto", contenido: "Producto,Precio\nIbupirac,12500", nombre: "ofertas.xlsx" },
  ], "vigencia hasta fin de mes");
  assert.strictEqual(pedido.model, "claude-opus-5-5");
  assert.deepStrictEqual(pedido.betas, ["server-side-fallback-2026-07-01"]);
  assert.strictEqual(pedido.fallbacks, "default");
  assert.strictEqual(pedido.output_config.format.type, "json_schema");
  const c = pedido.messages[0].content;
  assert.deepStrictEqual(c.map(b => b.type), ["image", "document", "text", "text"]);
  assert.strictEqual(c[1].source.media_type, "application/pdf");
  assert(c[2].text.includes("ofertas.xlsx") && c[3].text.includes("vigencia hasta fin de mes"));
  assert.strictEqual(r.ofertas[0].descuento_pct, 25);         // calculado
  assert.strictEqual(r.ofertas[1].precio_ahora, 27230);       // 38900 - 30%
  assert.strictEqual(r.ofertas[2].condicion, "2x1");
  console.log("✓ pedido con formato fijo, respaldo y documentos; precios normalizados"); ok++;

  // 2) esquema estricto: todas las propiedades requeridas y sin campos extra
  const it = O.ESQUEMA.properties.ofertas.items;
  assert.strictEqual(it.additionalProperties, false);
  assert.deepStrictEqual([...it.required].sort(), Object.keys(it.properties).sort());
  console.log("✓ esquema estricto"); ok++;

  // 3) errores claros
  await assert.rejects(O.extraer(falso({ stop_reason: "refusal", content: [] }), [{ tipo: "texto", contenido: "x" }]), /no pudo procesar/);
  await assert.rejects(O.extraer(falso({ stop_reason: "max_tokens", content: [] }), [{ tipo: "texto", contenido: "x" }]), /demasiadas ofertas/);
  await assert.rejects(O.descargarImagen("http://169.254.169.254/latest"), /no permitida/);
  await assert.rejects(O.descargarImagen("ftp://x/y.png"), /inválida/);
  console.log("✓ rechazos, respuestas cortadas y direcciones internas"); ok++;

  console.log("OK:", ok, "pruebas de ofertas");
})().catch(e => { console.error("FALLÓ:", e.stack || e.message); process.exit(1); });
