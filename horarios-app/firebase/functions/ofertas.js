// Ofertas y descuentos: Claude lee los archivos que sube un administrador (fotos, Excel/CSV
// convertido a texto, Word convertido a texto o PDF) y devuelve la lista de ofertas con formato
// fijo (structured outputs). Después se busca la foto de cada producto en Google Imágenes.
const MODELO = "claude-opus-5-5";

const NUM_O_NULL = { type: ["number", "null"] };
const STR_O_NULL = { type: ["string", "null"] };
const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ofertas", "resumen", "advertencias"],
  properties: {
    resumen: { type: "string", description: "Una frase: cuántas ofertas encontraste y de qué." },
    advertencias: { type: "array", items: { type: "string" }, description: "Datos dudosos, ilegibles o faltantes." },
    ofertas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["producto", "presentacion", "marca", "categoria", "precio_antes", "precio_ahora", "descuento_pct", "condicion", "vigencia_desde", "vigencia_hasta", "busqueda_imagen"],
        properties: {
          producto: { type: "string", description: "Nombre comercial del producto, por ejemplo 'Ibupirac 400'." },
          presentacion: STR_O_NULL,
          marca: STR_O_NULL,
          categoria: { type: "string", enum: ["Medicamentos", "Dermocosmética", "Perfumería", "Bebés", "Cuidado personal", "Nutrición", "Otros"] },
          precio_antes: NUM_O_NULL,
          precio_ahora: NUM_O_NULL,
          descuento_pct: NUM_O_NULL,
          condicion: STR_O_NULL,
          vigencia_desde: STR_O_NULL,
          vigencia_hasta: STR_O_NULL,
          busqueda_imagen: { type: "string", description: "Búsqueda para encontrar la foto del envase en Google Imágenes." },
        },
      },
    },
  },
};

const INSTRUCCIONES = (hoy, nota) => `Sos el asistente de las farmacias La Esquina y Belgrano (Argentina). Te paso material con descuentos y ofertas (fotos de carteles o listas, planillas de Excel/CSV convertidas a texto, documentos de Word convertidos a texto o PDF). Armá la lista de ofertas para publicar en la app.

Reglas:
- Una oferta por producto/presentación. No inventes productos ni precios: si un dato no está, dejalo en null.
- Precios en pesos argentinos, como número (por ejemplo 12500.5). "$ 12.500,50" es 12500.5.
- Si hay precio de antes y descuento pero no precio de ahora, calculalo (redondeado a centavos). Si hay los dos precios, calculá descuento_pct entero. Si sólo hay un porcentaje, dejá los precios en null.
- condicion: promociones o requisitos ("2x1", "segunda unidad al 50%", "con tarjeta X", "hasta agotar stock"). null si no hay.
- Fechas en formato AAAA-MM-DD. Hoy es ${hoy}. Si dice "hasta el 31/12", es del año en curso (o del próximo si ya pasó).
- categoria: la que mejor corresponda.
- busqueda_imagen: marca + producto + presentación + "caja" o "envase" (por ejemplo "Ibupirac 400 mg 20 comprimidos caja"), para encontrar la foto del producto.
- En advertencias anotá lo que no se lea bien o parezca un error (por ejemplo un precio de ahora mayor al de antes).${nota ? `\n\nIndicaciones del administrador: ${nota}` : ""}`;

/** Lee los archivos y devuelve { ofertas, resumen, advertencias }. */
async function extraer(anthropic, archivos, nota) {
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" });
  const content = [];
  for (const a of archivos) {
    if (a.tipo === "imagen") content.push({ type: "image", source: { type: "base64", media_type: a.media, data: a.datos } });
    else if (a.tipo === "pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: a.datos }, title: a.nombre || "documento.pdf" });
    else if (a.tipo === "texto") content.push({ type: "text", text: `Archivo "${a.nombre || "sin nombre"}":\n${String(a.contenido).slice(0, 150000)}` });
  }
  content.push({ type: "text", text: INSTRUCCIONES(hoy, nota) });

  const r = await anthropic.beta.messages.create({
    model: MODELO,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA } },
    messages: [{ role: "user", content }],
  });
  if (r.stop_reason === "refusal") throw new Error("La IA no pudo procesar este material.");
  if (r.stop_reason === "max_tokens") throw new Error("Son demasiadas ofertas juntas. Probá subiendo los archivos de a uno.");
  const txt = r.content.filter(b => b.type === "text").map(b => b.text).join("");
  let out;
  try { out = JSON.parse(txt); } catch (e) { throw new Error("La IA devolvió un formato inesperado. Probá de nuevo."); }
  out.ofertas = (out.ofertas || []).slice(0, 60).map(normalizar);
  return out;
}

const redondo = n => n == null || !isFinite(n) ? null : Math.round(n * 100) / 100;
function normalizar(o) {
  const x = { ...o, precio_antes: redondo(o.precio_antes), precio_ahora: redondo(o.precio_ahora), descuento_pct: o.descuento_pct == null ? null : Math.round(o.descuento_pct) };
  if (x.precio_antes && x.precio_ahora && x.precio_antes > x.precio_ahora && x.descuento_pct == null)
    x.descuento_pct = Math.round((1 - x.precio_ahora / x.precio_antes) * 100);
  if (x.precio_antes && x.descuento_pct && x.precio_ahora == null) x.precio_ahora = redondo(x.precio_antes * (1 - x.descuento_pct / 100));
  return x;
}

/* ---------------- Google Imágenes ---------------- */
// cfg: { proveedor: "serper", clave }  o  { proveedor: "google", clave, cx }
async function buscarImagenes(q, cfg) {
  if (!cfg || !cfg.clave) return [];
  const ctrl = AbortSignal.timeout(10000);
  if (cfg.proveedor === "google") {
    const u = new URL("https://www.googleapis.com/customsearch/v1");
    Object.entries({ key: cfg.clave, cx: cfg.cx, q, searchType: "image", num: "8", gl: "ar", hl: "es", safe: "active" }).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u, { signal: ctrl });
    if (!r.ok) throw new Error(`Google respondió ${r.status}. Revisá la clave y el ID del buscador.`);
    const j = await r.json();
    return (j.items || []).map(i => ({ url: i.link, miniatura: i.image && i.image.thumbnailLink, fuente: i.displayLink, titulo: i.title }));
  }
  const r = await fetch("https://google.serper.dev/images", {
    method: "POST", signal: ctrl,
    headers: { "X-API-KEY": cfg.clave, "Content-Type": "application/json" },
    body: JSON.stringify({ q, gl: "ar", hl: "es-419", num: 10 }),
  });
  if (!r.ok) throw new Error(`El buscador de imágenes respondió ${r.status}. Revisá la clave.`);
  const j = await r.json();
  return (j.images || []).map(i => ({ url: i.imageUrl, miniatura: i.thumbnailUrl, fuente: i.domain || i.source, titulo: i.title }));
}

/** Descarga una imagen (para que la app la pueda achicar y guardar). Devuelve { media, datos } en base64. */
async function descargarImagen(url) {
  let u;
  try { u = new URL(url); } catch (e) { throw new Error("Dirección de imagen inválida."); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Dirección de imagen inválida.");
  // no seguir direcciones internas
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(u.hostname) || /metadata/i.test(u.hostname)) throw new Error("Dirección no permitida.");
  const r = await fetch(u, { signal: AbortSignal.timeout(10000), redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; MisHorarios/1.0)", Accept: "image/*" } });
  if (!r.ok) throw new Error(`La imagen no está disponible (${r.status}).`);
  const media = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!/^image\/(jpeg|png|webp)$/.test(media)) throw new Error("El archivo no es una foto (jpg, png o webp).");
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 4 * 1024 * 1024) throw new Error("La imagen es demasiado grande.");
  if (buf.length < 2000) throw new Error("La imagen es demasiado chica.");
  return { media, datos: buf.toString("base64") };
}

module.exports = { extraer, buscarImagenes, descargarImagen, normalizar, ESQUEMA };
