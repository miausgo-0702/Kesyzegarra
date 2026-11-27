// Pestaña "Ofertas": feed de mini flyers para todos y carga con IA para los administradores.
// Usa window.MH (estado, datos y utilidades que expone app.js).
(function (G) {
  "use strict";
  const $ = id => document.getElementById(id);
  const CATEGORIAS = ["Medicamentos", "Dermocosmética", "Perfumería", "Bebés", "Cuidado personal", "Nutrición", "Otros"];
  const O = { lista: [], rev: 0, pintado: -1, filtro: "", cat: "", vencidas: false, borradores: null };
  const hoyYMD = () => new Date().toLocaleDateString("sv-SE");
  const pesos = n => n == null || n === "" || isNaN(n) ? "" : "$ " + Number(n).toLocaleString("es-AR", { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const fechaCorta = s => { if (!s) return ""; const [y, m, d] = s.split("-"); return `${+d}/${+m}`; };
  const esc = s => G.MH.esc(s);

  function vigente(o) { return !o.vigencia_hasta || o.vigencia_hasta >= hoyYMD(); }
  function iniciales(t) { return String(t || "?").split(/\s+/).slice(0, 2).map(x => x[0]).join("").toUpperCase(); }

  /* ======================= flyer (HTML) ======================= */
  function flyerHTML(o, admin) {
    const pct = o.descuento_pct ? `<div class="fl-badge"><b>-${o.descuento_pct}%</b><span>OFF</span></div>` : o.condicion && /2x1|3x2/i.test(o.condicion) ? `<div class="fl-badge"><b>${esc(o.condicion.match(/\dx\d/i)[0].toUpperCase())}</b></div>` : "";
    const venc = !vigente(o);
    return `<article class="flyer ${venc ? "vencida" : ""}" data-id="${esc(o.id || "")}">
      <div class="fl-top"><img src="img/logo.svg" alt="" class="fl-logo"><span class="fl-cat">${esc(o.categoria || "Oferta")}</span>${venc ? '<span class="fl-cat venc">Vencida</span>' : ""}</div>
      <div class="fl-img">${o.imagen ? `<img src="${esc(o.imagen)}" alt="${esc(o.producto)}" loading="lazy">` : `<div class="fl-sinimg"><span>💊</span><b>${esc(iniciales(o.producto))}</b></div>`}${pct}</div>
      <div class="fl-body">
        <h4>${esc(o.producto)}</h4>
        ${o.presentacion || o.marca ? `<div class="fl-pres">${esc([o.presentacion, o.marca].filter(Boolean).join(" · "))}</div>` : ""}
        <div class="fl-precios">${o.precio_antes ? `<span class="fl-antes">${pesos(o.precio_antes)}</span>` : ""}${o.precio_ahora ? `<span class="fl-ahora">${pesos(o.precio_ahora)}</span>` : o.descuento_pct ? `<span class="fl-ahora">${o.descuento_pct}% OFF</span>` : ""}</div>
        ${o.condicion ? `<div class="fl-cond">${esc(o.condicion)}</div>` : ""}
        <div class="fl-vig">${o.vigencia_hasta ? `Válido hasta el ${fechaCorta(o.vigencia_hasta)}` : "Hasta agotar stock"}</div>
      </div>
      <div class="fl-acc"><button class="btn sm" data-a="compartir">Compartir</button>${admin ? `<button class="btn sm" data-a="editar">Editar</button><button class="btn sm bad" data-a="borrar">Borrar</button>` : ""}</div>
    </article>`;
  }

  /* ======================= feed ======================= */
  function render(cont) {
    const MH = G.MH, admin = MH.st.user.tipo === "admin";
    if (!$("ofFeed")) {
      O.filtro = ""; O.cat = ""; O.vencidas = false;
      cont.innerHTML = `<div class="of">
        <div class="card of-cab">
          <div class="of-marca"><img src="img/logo.svg" alt=""><div><b>Ofertas y descuentos</b><div class="muted">La Esquina · Belgrano</div></div></div>
          ${admin ? `<button class="btn acc" id="ofCargar">✨ Cargar ofertas con IA</button>` : ""}
        </div>
        <div class="of-filtros">
          <input class="in" id="ofBuscar" placeholder="Buscar producto…" type="search">
          <div class="seg of-cats" id="ofCats"></div>
          ${admin ? `<label class="muted of-venc"><input type="checkbox" id="ofVenc"> Ver vencidas</label>` : ""}
        </div>
        <div class="of-feed" id="ofFeed"></div>
      </div>`;
      $("ofBuscar").oninput = () => { O.filtro = $("ofBuscar").value; O.rev++; pintar(); };
      if ($("ofVenc")) $("ofVenc").onchange = () => { O.vencidas = $("ofVenc").checked; O.rev++; pintar(); };
      if ($("ofCargar")) $("ofCargar").onclick = abrirCarga;
      $("ofFeed").onclick = async e => {
        const b = e.target.closest("[data-a]"); if (!b) return;
        const id = b.closest(".flyer").dataset.id, o = O.lista.find(x => x.id === id); if (!o) return;
        if (b.dataset.a === "compartir") compartir(o);
        if (b.dataset.a === "editar") abrirEditor([{ ...o }], "Editar oferta");
        if (b.dataset.a === "borrar" && confirm(`¿Borrar la oferta de ${o.producto}?`)) { try { await MH.B.borrarOferta(id); MH.toast("Oferta borrada"); } catch (er) { MH.toast(er.message); } }
      };
      O.pintado = -1;
    }
    pintar();
  }
  function pintar() {
    const feed = $("ofFeed"); if (!feed || O.pintado === O.rev) return;
    O.pintado = O.rev;
    const admin = G.MH.st.user.tipo === "admin";
    const base = O.lista.filter(o => (O.vencidas && admin) || vigente(o));
    const cats = CATEGORIAS.filter(c => base.some(o => o.categoria === c));
    $("ofCats").innerHTML = `<button class="${O.cat ? "" : "on"}" data-c="">Todas</button>` + cats.map(c => `<button class="${O.cat === c ? "on" : ""}" data-c="${esc(c)}">${esc(c)}</button>`).join("");
    $("ofCats").querySelectorAll("button").forEach(b => b.onclick = () => { O.cat = b.dataset.c; O.rev++; pintar(); });
    const q = G.L.norm(O.filtro || "");
    const lista = base.filter(o => (!O.cat || o.categoria === O.cat) && (!q || G.L.norm([o.producto, o.marca, o.presentacion].join(" ")).includes(q)))
      .sort((a, b) => (b.creado || 0) - (a.creado || 0));
    feed.innerHTML = lista.length ? lista.map(o => flyerHTML(o, admin)).join("")
      : `<div class="card of-vacio"><div class="of-vacio-ico">🏷️</div><b>${O.lista.length ? "No hay ofertas con ese filtro" : "Todavía no hay ofertas publicadas"}</b><p class="muted">${admin ? "Tocá “Cargar ofertas con IA” y subí fotos, un Excel, un PDF o un Word con los descuentos." : "Cuando la farmacia publique descuentos, los vas a ver acá."}</p></div>`;
  }
  function setLista(l) { O.lista = l || []; O.rev++; if (G.MH && G.MH.st.vista === "ofertas") pintar(); }

  /* ======================= carga con IA (administradores) ======================= */
  const cargarScript = src => new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("No se pudo cargar " + src)); document.head.appendChild(s);
  });
  const leerBuffer = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("No pude leer " + f.name)); r.readAsArrayBuffer(f); });
  const aBase64 = buf => { let s = ""; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };
  function achicar(src, max, calidad) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", calidad || 0.85));
      };
      img.onerror = () => rej(new Error("No pude abrir la imagen."));
      img.src = src;
    });
  }

  /** Convierte un archivo al formato que entiende la IA. */
  async function convertir(f) {
    const n = f.name.toLowerCase();
    if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f); const d = await achicar(url, 1600, 0.86); URL.revokeObjectURL(url);
      return { tipo: "imagen", media: "image/jpeg", datos: d.split(",")[1], nombre: f.name };
    }
    if (n.endsWith(".pdf")) {
      if (f.size > 6 * 1024 * 1024) throw new Error(`${f.name} pesa más de 6 MB.`);
      return { tipo: "pdf", datos: aBase64(await leerBuffer(f)), nombre: f.name };
    }
    if (/\.(xlsx|xlsm|xls|csv|ods)$/.test(n)) {
      await cargarScript("vendor/xlsx.full.min.js");
      const wb = XLSX.read(await leerBuffer(f), { type: "array" });
      const txt = wb.SheetNames.map(h => `Hoja "${h}":\n` + XLSX.utils.sheet_to_csv(wb.Sheets[h], { blankrows: false })).join("\n\n");
      return { tipo: "texto", contenido: txt, nombre: f.name };
    }
    if (n.endsWith(".docx")) {
      await cargarScript("vendor/mammoth.browser.min.js");
      const r = await mammoth.extractRawText({ arrayBuffer: await leerBuffer(f) });
      return { tipo: "texto", contenido: r.value, nombre: f.name };
    }
    if (n.endsWith(".txt")) return { tipo: "texto", contenido: await f.text(), nombre: f.name };
    if (n.endsWith(".doc")) throw new Error(`${f.name}: guardalo como .docx (Word moderno) y volvé a subirlo.`);
    throw new Error(`${f.name}: formato no soportado. Usá fotos, Excel, PDF o Word (.docx).`);
  }

  function hoja(html) { const MH = G.MH; MH.abrirHoja(html); return $("sheetBody"); }

  function abrirCarga() {
    const archivos = [];
    const b = hoja(`<h3 style="margin:0 0 4px">✨ Cargar ofertas con IA</h3>
      <p class="muted" style="margin:0 0 12px">Subí fotos de carteles o listas, un Excel, un PDF o un Word con los descuentos. La IA arma un flyer por producto, busca la foto en Google y vos revisás antes de publicar.</p>
      <label class="of-drop" id="ofDrop"><input type="file" id="ofArch" multiple accept="image/*,.pdf,.xlsx,.xls,.xlsm,.csv,.ods,.docx,.txt" class="oculto">
        <span class="of-drop-ico">📎</span><b>Elegir archivos</b><span class="muted">Fotos · Excel · PDF · Word</span></label>
      <div class="list" id="ofLista"></div>
      <div class="field" style="margin-top:10px"><label>Indicaciones (opcional)</label><input class="in" id="ofNota" placeholder="Ej: vigencia hasta el 31/12, solo pago en efectivo"></div>
      <div class="muted" id="ofMsg" style="min-height:18px"></div>
      <button class="btn acc" id="ofProcesar" style="width:100%">✨ Armar ofertas</button>
      <details style="margin-top:14px"><summary class="muted">Buscador de imágenes de Google</summary>
        <p class="muted">Para que la IA busque las fotos en Google Imágenes hace falta una clave de <b>Serper.dev</b> (2.500 búsquedas gratis) o de la búsqueda programable de Google. La clave queda guardada en el servidor y no se puede volver a leer desde la app.</p>
        <div class="row"><select class="in f" id="ofProv"><option value="serper">Serper.dev (Google Imágenes)</option><option value="google">Google Programmable Search</option></select></div>
        <div class="row" style="margin-top:6px"><input class="in f" id="ofClave" placeholder="Clave (API key)" autocomplete="off"><input class="in f oculto" id="ofCx" placeholder="ID del buscador (cx)"></div>
        <button class="btn" id="ofGuardarClave" style="margin-top:8px">Guardar clave</button>
      </details>`);
    const pintarLista = () => { $("ofLista").innerHTML = archivos.map((f, i) => `<div class="it"><span>${f.type.startsWith("image/") ? "🖼️" : /\.pdf$/i.test(f.name) ? "📕" : /\.docx?$/i.test(f.name) ? "📘" : "📗"}</span><div class="grow">${esc(f.name)} <span class="muted">${Math.round(f.size / 1024)} KB</span></div><button class="btn sm" data-q="${i}">Quitar</button></div>`).join(""); $("ofLista").querySelectorAll("[data-q]").forEach(x => x.onclick = () => { archivos.splice(+x.dataset.q, 1); pintarLista(); }); };
    $("ofArch").onchange = () => { [...$("ofArch").files].forEach(f => archivos.length < 10 && archivos.push(f)); $("ofArch").value = ""; pintarLista(); };
    $("ofProv").onchange = () => $("ofCx").classList.toggle("oculto", $("ofProv").value !== "google");
    $("ofGuardarClave").onclick = async () => {
      const cfg = { proveedor: $("ofProv").value, clave: $("ofClave").value.trim() }; if ($("ofProv").value === "google") cfg.cx = $("ofCx").value.trim();
      if (!cfg.clave) return G.MH.toast("Pegá la clave");
      try { await G.MH.B.guardarClaveImagenes(cfg); $("ofClave").value = ""; G.MH.toast("✓ Clave guardada"); } catch (e) { G.MH.toast(e.message); }
    };
    $("ofProcesar").onclick = async () => {
      if (!archivos.length) { $("ofMsg").textContent = "Elegí al menos un archivo."; return; }
      $("ofProcesar").disabled = true;
      try {
        $("ofMsg").textContent = "Leyendo archivos…";
        const conv = []; for (const f of archivos) conv.push(await convertir(f));
        procesar(conv, $("ofNota").value.trim());
      } catch (e) { $("ofMsg").textContent = e.message; $("ofProcesar").disabled = false; }
    };
  }

  async function procesar(conv, nota) {
    const b = hoja(`<div class="of-proc"><div id="ofCara"></div><h3 id="ofEstado">La IA está leyendo las ofertas…</h3><p class="muted" id="ofDet">Esto puede tardar un minuto.</p></div>`);
    let cara = null;
    try { cara = G.LiveOrb.mount($("ofCara"), { size: 110, variant: "webgl", colors: ["#7a3a72", "#b3bb06", "#eadd12"], lookAt: { x: 0.45, y: 0.6 }, speed: 1.8, label: "Asistente" }); } catch (e) {}
    const fin = () => cara && cara.destroy();
    let r;
    try { r = await G.MH.B.ofertasIA({ accion: "extraer", archivos: conv, nota }); }
    catch (e) { fin(); $("ofEstado").textContent = "No se pudo procesar"; $("ofDet").textContent = e.message; return; }
    if (!r.ofertas || !r.ofertas.length) { fin(); $("ofEstado").textContent = "No encontré ofertas"; $("ofDet").textContent = (r.advertencias || []).join(" ") || "Probá con una foto más clara o con el archivo original."; return; }
    const bor = r.ofertas.map(o => ({ ...o, imagen: null, candidatas: null, idxImg: -1 }));
    $("ofEstado").textContent = `Encontré ${bor.length} ofertas`;
    if (r.conBuscador) {
      let listos = 0;
      $("ofDet").textContent = `Buscando las fotos en Google… (0/${bor.length})`;
      await enParalelo(bor, 3, async o => { await buscarFoto(o); listos++; $("ofDet") && ($("ofDet").textContent = `Buscando las fotos en Google… (${listos}/${bor.length})`); });
    }
    fin();
    abrirEditor(bor, `Revisá ${bor.length} ofertas`, r);
  }
  async function enParalelo(lista, n, f) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < lista.length) { const x = lista[i++]; try { await f(x); } catch (e) {} } })); }
  async function buscarFoto(o, siguiente) {
    if (!o.candidatas) { const r = await G.MH.B.ofertasIA({ accion: "buscar", q: o.busqueda_imagen || o.producto }); o.candidatas = r.imagenes || []; }
    for (let i = (siguiente ? o.idxImg + 1 : 0); i < Math.min(o.candidatas.length, 10); i++) {
      try {
        const im = await G.MH.B.ofertasIA({ accion: "imagen", url: o.candidatas[i].url });
        o.imagen = await achicar(`data:${im.media};base64,${im.datos}`, 640, 0.82);
        o.idxImg = i; o.fuenteImg = o.candidatas[i].fuente || ""; return true;
      } catch (e) { /* probar la siguiente */ }
    }
    return false;
  }

  /* ======================= revisión y edición ======================= */
  function abrirEditor(bor, titulo, r) {
    const MH = G.MH;
    O.borradores = bor;
    const pintarEd = () => {
      hoja(`<h3 style="margin:0 0 4px">${esc(titulo)}</h3>
        ${r && r.resumen ? `<p class="muted" style="margin:0 0 6px">${esc(r.resumen)}</p>` : ""}
        ${r && r.advertencias && r.advertencias.length ? `<div class="nota">⚠ ${r.advertencias.map(esc).join("<br>⚠ ")}</div>` : ""}
        ${r && !r.conBuscador ? `<div class="nota">Sin buscador de imágenes configurado: podés subir una foto en cada oferta, o cargar la clave en “Buscador de imágenes de Google”.</div>` : ""}
        <div class="of-ed">${bor.map((o, i) => `<div class="of-ed-it" data-i="${i}">
          <div class="of-ed-prev">${flyerHTML(o, false)}</div>
          <div class="of-ed-campos">
            <div class="row"><input class="in f" data-k="producto" value="${esc(o.producto)}" placeholder="Producto"><select class="in" data-k="categoria">${CATEGORIAS.map(c => `<option ${o.categoria === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
            <div class="row"><input class="in f" data-k="presentacion" value="${esc(o.presentacion || "")}" placeholder="Presentación"><input class="in f" data-k="marca" value="${esc(o.marca || "")}" placeholder="Marca / laboratorio"></div>
            <div class="row"><input class="in f" data-k="precio_antes" inputmode="decimal" value="${o.precio_antes ?? ""}" placeholder="Antes $"><input class="in f" data-k="precio_ahora" inputmode="decimal" value="${o.precio_ahora ?? ""}" placeholder="Ahora $"><input class="in" style="width:80px" data-k="descuento_pct" inputmode="numeric" value="${o.descuento_pct ?? ""}" placeholder="% off"></div>
            <div class="row"><input class="in f" data-k="condicion" value="${esc(o.condicion || "")}" placeholder="Condición (2x1, con tarjeta…)"><input class="in" type="date" data-k="vigencia_hasta" value="${esc(o.vigencia_hasta || "")}" title="Válido hasta"></div>
            <div class="row"><button class="btn sm" data-a="otra">🔄 Otra foto</button><label class="btn sm">📷 Subir foto<input type="file" accept="image/*" data-a="subir" class="oculto"></label><button class="btn sm bad" data-a="quitar">Quitar</button>${o.fuenteImg ? `<span class="muted">Foto: ${esc(o.fuenteImg)}</span>` : ""}</div>
          </div></div>`).join("")}</div>
        <button class="btn acc" id="ofPublicar" style="width:100%;margin-top:10px">${bor.length === 1 && bor[0].id ? "Guardar cambios" : `Publicar ${bor.length} ofertas`}</button>`);
      document.querySelectorAll(".of-ed-it").forEach(it => {
        const o = bor[+it.dataset.i];
        const repintar = () => { it.querySelector(".of-ed-prev").innerHTML = flyerHTML(o, false); };
        it.querySelectorAll("[data-k]").forEach(inp => inp.oninput = inp.onchange = () => {
          const k = inp.dataset.k; let v = inp.value.trim();
          if (/precio|descuento/.test(k)) v = v === "" ? null : Number(v.replace(/\$|\s|\./g, "").replace(",", "."));
          o[k] = v === "" ? null : v;
          if ((k === "precio_antes" || k === "precio_ahora") && o.precio_antes && o.precio_ahora && o.precio_antes > o.precio_ahora) {
            o.descuento_pct = Math.round((1 - o.precio_ahora / o.precio_antes) * 100); it.querySelector('[data-k="descuento_pct"]').value = o.descuento_pct;
          }
          repintar();
        });
        it.querySelector('[data-a="otra"]').onclick = async e => {
          e.target.disabled = true; e.target.textContent = "Buscando…";
          const ok = await buscarFoto(o, true).catch(() => false);
          if (!ok) MH.toast("No encontré otra foto. Podés subir una."); pintarEd();
        };
        it.querySelector('[data-a="subir"]').onchange = async e => { const f = e.target.files[0]; if (!f) return; const u = URL.createObjectURL(f); o.imagen = await achicar(u, 640, 0.82); URL.revokeObjectURL(u); o.fuenteImg = "subida"; repintar(); };
        it.querySelector('[data-a="quitar"]').onclick = () => { bor.splice(+it.dataset.i, 1); bor.length ? pintarEd() : MH.cerrarHoja(); };
      });
      $("ofPublicar").onclick = async () => {
        const malos = bor.filter(o => !o.producto); if (malos.length) return MH.toast("Hay ofertas sin nombre de producto.");
        $("ofPublicar").disabled = true; $("ofPublicar").textContent = "Publicando…";
        try {
          for (const o of bor) {
            const x = { producto: o.producto, presentacion: o.presentacion || null, marca: o.marca || null, categoria: o.categoria || "Otros",
              precio_antes: o.precio_antes ?? null, precio_ahora: o.precio_ahora ?? null, descuento_pct: o.descuento_pct ?? null,
              condicion: o.condicion || null, vigencia_desde: o.vigencia_desde || null, vigencia_hasta: o.vigencia_hasta || null,
              imagen: o.imagen || null };
            if (o.id) x.id = o.id; else { x.creado = Date.now(); x.por = MH.st.user.usuario; }
            await MH.B.guardarOferta(x);
          }
          MH.toast(bor[0] && bor[0].id && bor.length === 1 ? "✓ Oferta actualizada" : `✓ ${bor.length} ofertas publicadas`);
          MH.cerrarHoja(); O.borradores = null;
        } catch (e) { MH.toast(e.message); $("ofPublicar").disabled = false; $("ofPublicar").textContent = "Publicar"; }
      };
    };
    pintarEd();
  }

  /* ======================= compartir como imagen ======================= */
  const cargarImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  function lineas(ctx, texto, ancho) {
    const out = []; let l = "";
    String(texto).split(" ").forEach(p => { const t = l ? l + " " + p : p; if (ctx.measureText(t).width > ancho && l) { out.push(l); l = p; } else l = t; });
    if (l) out.push(l); return out;
  }
  /** Dibuja el flyer en un canvas de 1080 x 1350 (formato de historia / publicación). */
  async function flyerCanvas(o) {
    const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const F = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
    // franja superior con la marca
    const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, "#b3bb06"); g.addColorStop(1, "#eadd12");
    x.fillStyle = g; x.fillRect(0, 0, W, 170);
    try { const logo = await cargarImg("img/logo.svg"); x.drawImage(logo, 50, 30, 110, 110); } catch (e) {}
    x.fillStyle = "#3a4108"; x.font = `800 64px ${F}`; x.fillText("OFERTA", 190, 112);
    x.font = `600 30px ${F}`; x.textAlign = "right"; x.fillText(o.categoria || "", W - 50, 105); x.textAlign = "left";
    // foto
    const zona = { x: 90, y: 210, w: W - 180, h: 560 };
    if (o.imagen) {
      try { const im = await cargarImg(o.imagen); const k = Math.min(zona.w / im.width, zona.h / im.height); const w = im.width * k, h = im.height * k; x.drawImage(im, zona.x + (zona.w - w) / 2, zona.y + (zona.h - h) / 2, w, h); } catch (e) {}
    } else { x.font = `200px ${F}`; x.textAlign = "center"; x.fillText("💊", W / 2, 560); x.textAlign = "left"; }
    // sello de descuento
    if (o.descuento_pct || (o.condicion && /\dx\d/i.test(o.condicion))) {
      const cx = W - 190, cy = 300, R = 130, n = 16;
      x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = (Math.PI * i) / n - Math.PI / 2, r = i % 2 ? R * 0.84 : R; x.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); } x.closePath();
      x.fillStyle = "#65265d"; x.fill();
      x.fillStyle = "#fff"; x.textAlign = "center";
      if (o.descuento_pct) { x.font = `900 78px ${F}`; x.fillText(`-${o.descuento_pct}%`, cx, cy + 18); x.font = `800 30px ${F}`; x.fillText("OFF", cx, cy + 58); }
      else { x.font = `900 80px ${F}`; x.fillText(o.condicion.match(/\dx\d/i)[0].toUpperCase(), cx, cy + 28); }
      x.textAlign = "left";
    }
    // textos
    let y = 840;
    x.fillStyle = "#20240f"; x.font = `800 66px ${F}`;
    lineas(x, o.producto, W - 120).slice(0, 2).forEach(l => { x.fillText(l, 60, y); y += 74; });
    const pres = [o.presentacion, o.marca].filter(Boolean).join(" · ");
    if (pres) { x.fillStyle = "#6c7257"; x.font = `500 36px ${F}`; x.fillText(lineas(x, pres, W - 120)[0], 60, y); y += 60; }
    y += 20;
    if (o.precio_antes) {
      x.fillStyle = "#8a8f78"; x.font = `600 46px ${F}`; const t = pesos(o.precio_antes); x.fillText(t, 60, y + 40);
      const w = x.measureText(t).width; x.strokeStyle = "#e5484d"; x.lineWidth = 5; x.beginPath(); x.moveTo(55, y + 24); x.lineTo(65 + w, y + 24); x.stroke();
    }
    if (o.precio_ahora) { x.fillStyle = "#65265d"; x.font = `900 120px ${F}`; x.fillText(pesos(o.precio_ahora), 60, y + 170); }
    y += 210;
    if (o.condicion) { x.fillStyle = "#3a4108"; x.font = `700 38px ${F}`; x.fillText(lineas(x, o.condicion, W - 120)[0], 60, y); }
    // pie
    x.fillStyle = "#f4f6ea"; x.fillRect(0, H - 120, W, 120);
    x.fillStyle = "#3a4108"; x.font = `700 32px ${F}`; x.fillText("Farmacias La Esquina · Belgrano", 60, H - 66);
    x.fillStyle = "#6c7257"; x.font = `500 26px ${F}`;
    x.fillText(o.vigencia_hasta ? `Válido hasta el ${fechaCorta(o.vigencia_hasta)} o hasta agotar stock.` : "Hasta agotar stock.", 60, H - 30);
    return c;
  }
  async function compartir(o) {
    const MH = G.MH;
    try {
      const c = await flyerCanvas(o);
      const datos = c.toDataURL("image/png");
      const nombre = "oferta-" + String(o.producto).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + ".png";
      if (G.AndroidApp && G.AndroidApp.compartirImagen) { G.AndroidApp.compartirImagen(datos.split(",")[1], nombre, `Oferta: ${o.producto}`); return; }
      const blob = await (await fetch(datos)).blob();
      const file = new File([blob], nombre, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: `Oferta: ${o.producto}` }); return; }
      const a = document.createElement("a"); a.href = datos; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
      MH.toast("Imagen descargada");
    } catch (e) { if (e && e.name !== "AbortError") MH.toast("No se pudo compartir la imagen."); }
  }

  G.Ofertas = { render, setLista, flyerCanvas, flyerHTML, _estado: O };
})(window);
