/* Belgrano · Planillas
 * Foto → lectura de código de barras → planilla de Pedidos o Vencidos
 * → recordatorio en Google Calendar → PDF para WhatsApp / Gmail.
 * Todo queda guardado en el teléfono (localStorage). */
(() => {
  'use strict';

  // ---------- Utilidades ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const isoHoy = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
  const fmt = iso => iso ? iso.split('-').reverse().join('/') : '—';
  const diasHasta = iso => Math.round((parseISO(iso) - parseISO(isoHoy())) / 86400000);
  const compact = iso => iso.replace(/-/g, '');

  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('No se pudo guardar en el teléfono'); } }
  };

  // ---------- Estado ----------
  const S = {
    pedidos: store.get('le_pedidos', []),
    vencidos: store.get('le_vencidos', []),
    catalogo: store.get('le_catalogo', {}),
    cfg: Object.assign({ sucursal: '', dias: 3, autoCal: true, wa: '', mail: '', clientId: '' }, store.get('le_cfg', {})),
    dest: 'pedidos',
    filtro: { pedidos: '', vencidos: '' }
  };
  const guardar = () => {
    store.set('le_pedidos', S.pedidos);
    store.set('le_vencidos', S.vencidos);
    store.set('le_catalogo', S.catalogo);
  };

  // ---------- Toast ----------
  let toastT;
  function toast(msg, accion) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>`;
    if (accion) {
      const b = document.createElement('button');
      b.textContent = accion.label;
      b.onclick = () => { t.classList.remove('show'); accion.fn(); };
      t.appendChild(b);
    }
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), accion ? 5000 : 2600);
  }

  // ---------- Navegación + burbuja ----------
  function ir(vista) {
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + vista));
    const tab = $(`.tab[data-go="${vista}"]`);
    $$('.tab').forEach(t => t.classList.toggle('active', t === tab));
    moverBurbuja(tab);
    if (vista !== 'escanear') pararVivo();
    else setTimeout(iniciarCamara, 50);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try { history.replaceState(null, '', '#' + vista); } catch {}
  }
  function moverBurbuja(tab) {
    if (!tab) return;
    const dock = $('.dock').getBoundingClientRect();
    const r = tab.getBoundingClientRect();
    const x = r.left - dock.left + r.width / 2 - 27;
    const bead = $('#bead');
    bead.style.transform = `translateX(${x}px)`;
    const col = tab.dataset.color;
    bead.style.background = col;
    document.documentElement.style.setProperty('--bead', col);
  }
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-go]');
    if (g) ir(g.dataset.go);
  });
  window.addEventListener('resize', () => moverBurbuja($('.tab.active')));

  // ---------- Destino (Pedidos / Vencidos) ----------
  function setDest(d) {
    S.dest = d;
    $$('.seg').forEach(s => s.classList.toggle('on', s.dataset.dest === d));
    $('.dest-toggle').classList.toggle('v', d === 'vencidos');
    const f = $('#itemForm');
    f.classList.toggle('pedidos', d === 'pedidos');
    f.classList.toggle('vencidos', d === 'vencidos');
    $('#fVence').required = d === 'vencidos';
    $('#btnGuardar').textContent = d === 'pedidos' ? 'Guardar en Pedidos' : 'Guardar en A vencer';
  }
  $$('.seg').forEach(s => s.addEventListener('click', () => setDest(s.dataset.dest)));

  // ---------- Lectura de códigos ----------
  // ---------- App nativa (APK) ----------
  const CAP = window.Capacitor;
  const NATIVO = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
  if (NATIVO) document.documentElement.classList.add('nativo');
  // En el APK los links externos se abren en su app (Calendar, WhatsApp, Gmail)
  function abrirExterno(url) {
    if (!NATIVO) return window.open(url, '_blank');
    const a = document.createElement('a');
    a.href = url; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    return true;
  }
  const aBase64 = blob => new Promise((ok, mal) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = mal; fr.readAsDataURL(blob); });
  async function compartirNativo(files, texto) {
    const Filesystem = CAP.Plugins.Filesystem || CAP.registerPlugin('Filesystem');
    const Share = CAP.Plugins.Share || CAP.registerPlugin('Share');
    const uris = [];
    for (const f of files) {
      const r = await Filesystem.writeFile({ path: f.name, data: await aBase64(f), directory: 'CACHE' });
      uris.push(r.uri);
    }
    try { await Share.share({ title: 'Belgrano · Planillas', text: texto, files: uris, dialogTitle: 'Enviar por…' }); }
    catch (e) { if (!/cancel/i.test(String(e && e.message))) throw e; }
  }

  const ZX = window.ZXing;
  const zxHints = (() => {
    if (!ZX) return null;
    const h = new Map();
    const F = ZX.BarcodeFormat;
    h.set(ZX.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.CODABAR, F.QR_CODE, F.DATA_MATRIX]);
    h.set(ZX.DecodeHintType.TRY_HARDER, true);
    return h;
  })();

  async function cargarImagen(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { img, url };
  }

  async function leerConDetectorNativo(img) {
    if (!('BarcodeDetector' in window)) return null;
    try {
      const soportados = await window.BarcodeDetector.getSupportedFormats();
      const quiero = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code', 'data_matrix'];
      const det = new window.BarcodeDetector({ formats: quiero.filter(f => soportados.includes(f)) });
      const r = await det.detect(img);
      return r.length ? r[0].rawValue : null;
    } catch { return null; }
  }

  function leerConZXing(img) {
    if (!ZX) return null;
    const reader = new ZX.MultiFormatReader();
    reader.setHints(zxHints);
    const W = img.naturalWidth, H = img.naturalHeight;
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    // Distintos tamaños, recortes y rotaciones: las fotos de celular vienen grandes y a veces giradas
    const intentos = [];
    for (const lado of [1280, 900, 1800, 640]) for (const rot of [0, 90]) intentos.push({ lado, rot, crop: 1 });
    intentos.push({ lado: 1280, rot: 0, crop: .6 }, { lado: 1280, rot: 90, crop: .6 });
    for (const t of intentos) {
      const cw = W * t.crop, ch = H * t.crop, cx = (W - cw) / 2, cy = (H - ch) / 2;
      const k = Math.min(1, t.lado / Math.max(cw, ch));
      const w = Math.round(cw * k), h = Math.round(ch * k);
      if (t.rot) { cv.width = h; cv.height = w; } else { cv.width = w; cv.height = h; }
      ctx.save();
      if (t.rot) { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); }
      ctx.drawImage(img, cx, cy, cw, ch, 0, 0, w, h);
      ctx.restore();
      try {
        const src = new ZX.HTMLCanvasElementLuminanceSource(cv);
        const res = reader.decode(new ZX.BinaryBitmap(new ZX.HybridBinarizer(src)));
        if (res) return res.getText();
      } catch { /* sigue probando */ }
    }
    return null;
  }

  // ======================================================================
  //  ESCÁNER EN VIVO: la cámara queda prendida y el código se reconoce solo
  // ======================================================================
  const FORMATOS_NATIVOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code', 'data_matrix'];
  const Cam = {
    stream: null, track: null, activa: false, pausada: false,
    detector: null, worker: null, ocupado: false, idPedido: 0, ciclo: 0,
    ultimo: {}, ignorar: null, zoomPasos: [], zoomIdx: 0, linterna: false,
    canvas: document.createElement('canvas'), modo: 'uno'
  };
  Cam.ctx = Cam.canvas.getContext('2d', { willReadFrequently: true });

  const pill = (txt, cls = '') => { const p = $('#camPill'); p.textContent = txt; p.className = 'cam-pill ' + cls; };

  // Sonido corto de "bip" al leer
  let audio;
  function bip() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'square'; o.frequency.value = 1760;
      g.gain.setValueAtTime(.12, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .12);
      o.connect(g).connect(audio.destination);
      o.start(); o.stop(audio.currentTime + .12);
    } catch {}
    if (navigator.vibrate) navigator.vibrate(70);
    const f = $('#camFlash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  }

  async function prepararDetector() {
    // 1) Lector nativo del teléfono (Android/Chrome): el más rápido
    if (!Cam.detector && 'BarcodeDetector' in window) {
      try {
        const sop = await window.BarcodeDetector.getSupportedFormats();
        const f = FORMATOS_NATIVOS.filter(x => sop.includes(x));
        if (f.length) Cam.detector = new window.BarcodeDetector({ formats: f });
      } catch { Cam.detector = null; }
    }
    // 2) Lector ZXing en segundo plano (siempre disponible)
    if (!Cam.worker && window.Worker) {
      try {
        Cam.worker = new Worker('scan-worker.js');
        Cam.worker.onmessage = e => {
          const d = e.data;
          if (d.listo) return;
          if (d.id !== Cam.idPedido) return;
          Cam.ocupado = false;
          if (d.texto) detectado(d.texto);
        };
        Cam.worker.onerror = () => { Cam.worker = null; Cam.ocupado = false; };
      } catch { Cam.worker = null; }
    }
  }

  async function iniciarCamara() {
    if (Cam.activa) { reanudar(); return; }
    if (!navigator.mediaDevices?.getUserMedia) return camaraApagada('Este navegador no permite la cámara en vivo', 'Usá “Foto” o abrí la app desde https');
    $('#camOff').hidden = true;
    pill('Iniciando cámara…');
    try {
      Cam.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }
      });
    } catch (e) {
      const denegada = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      return camaraApagada(denegada ? 'Sin permiso para la cámara' : 'No se pudo abrir la cámara', denegada ? 'Habilitá el permiso de cámara y tocá acá' : 'Tocá para reintentar');
    }
    if (!$('#view-escanear').classList.contains('active')) { soltarCamara(); return; }
    Cam.track = Cam.stream.getVideoTracks()[0];
    const v = $('#liveVideo');
    v.srcObject = Cam.stream;
    v.hidden = false; $('#shotImg').hidden = true;
    try { await v.play(); } catch {}
    await ajustesCamara();
    await prepararDetector();
    Cam.activa = true; Cam.pausada = false;
    $('#cam').classList.add('viva'); $('#cam').classList.remove('pausa');
    $('#btnVivo').textContent = 'Pausar';
    pill('Apuntá al código de barras');
    bucle();
  }

  async function ajustesCamara() {
    const t = Cam.track;
    if (!t || !t.getCapabilities) return;
    const caps = t.getCapabilities();
    const adv = [];
    if (caps.focusMode && caps.focusMode.includes('continuous')) adv.push({ focusMode: 'continuous' });
    if (adv.length) { try { await t.applyConstraints({ advanced: adv }); } catch {} }
    $('#btnLinterna').hidden = !caps.torch;
    Cam.zoomPasos = [];
    if (caps.zoom && caps.zoom.max > 1) {
      const base = Math.max(1, caps.zoom.min);
      Cam.zoomPasos = [base, 1.6, 2.4, 3.2].filter(z => z <= caps.zoom.max && z >= base);
      Cam.zoomIdx = 0;
    }
    $('#btnZoom').hidden = Cam.zoomPasos.length < 2;
  }

  $('#btnLinterna').addEventListener('click', async () => {
    Cam.linterna = !Cam.linterna;
    try { await Cam.track.applyConstraints({ advanced: [{ torch: Cam.linterna }] }); } catch { Cam.linterna = false; }
    $('#btnLinterna').classList.toggle('on', Cam.linterna);
  });
  $('#btnZoom').addEventListener('click', async () => {
    Cam.zoomIdx = (Cam.zoomIdx + 1) % Cam.zoomPasos.length;
    const z = Cam.zoomPasos[Cam.zoomIdx];
    try { await Cam.track.applyConstraints({ advanced: [{ zoom: z }] }); } catch {}
    $('#btnZoom span').textContent = (Math.round(z * 10) / 10) + '×';
  });

  function camaraApagada(txt, sub) {
    soltarCamara();
    $('#camOffTxt').textContent = txt;
    $('#camOffSub').textContent = sub;
    $('#camOff').hidden = false;
    pill('Cámara apagada', 'off');
  }
  function soltarCamara() {
    Cam.activa = false; Cam.ocupado = false; Cam.linterna = false;
    if (Cam.stream) Cam.stream.getTracks().forEach(t => t.stop());
    Cam.stream = Cam.track = null;
    $('#liveVideo').srcObject = null;
    $('#cam').classList.remove('viva');
    $('#btnLinterna').classList.remove('on');
  }
  function pararVivo() {
    if (!Cam.activa) return;
    soltarCamara();
    $('#camOffTxt').textContent = 'Tocá para activar la cámara';
    $('#camOffSub').textContent = 'El código se lee solo, al instante';
    $('#camOff').hidden = false;
    $('#btnVivo').textContent = 'Activar cámara';
  }
  function pausar(msg) {
    Cam.pausada = true;
    $('#cam').classList.add('pausa');
    $('#btnVivo').textContent = 'Escanear otro';
    if (msg) pill(msg, 'ok');
  }
  function reanudar() {
    if (!Cam.activa) return iniciarCamara();
    Cam.pausada = false;
    $('#cam').classList.remove('pausa');
    $('#shotImg').hidden = true; $('#liveVideo').hidden = false;
    $('#btnVivo').textContent = 'Pausar';
    pill(Cam.modo === 'rafaga' ? 'Ráfaga: pasá los productos' : 'Apuntá al código de barras');
    bucle();
  }
  $('#btnVivo').addEventListener('click', () => {
    if (!Cam.activa) iniciarCamara();
    else if (Cam.pausada) reanudar();
    else { pausar(); pill('En pausa'); }
  });
  $('#camOff').addEventListener('click', iniciarCamara);
  $('#cam').addEventListener('click', e => {
    if (e.target.closest('.cam-btn,.cam-off')) return;
    if (Cam.activa && Cam.pausada) reanudar();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pararVivo();
    else if ($('#view-escanear').classList.contains('active')) iniciarCamara();
  });

  // Zona de lectura: el recuadro marcado en pantalla (con margen), en coordenadas del video
  function zonaLectura(v, vertical) {
    const box = $('#cam').getBoundingClientRect();
    const vw = v.videoWidth, vh = v.videoHeight;
    const s = Math.max(box.width / vw, box.height / vh);          // object-fit: cover
    const ox = (vw - box.width / s) / 2, oy = (vh - box.height / s) / 2;
    const r = $('#ventana').getBoundingClientRect();
    let x = ox + (r.left - box.left) / s, y = oy + (r.top - box.top) / s;
    let w = r.width / s, h = r.height / s;
    if (vertical) { const cx = x + w / 2, cy = y + h / 2; [w, h] = [h * 1.1, Math.min(vh, w)]; x = cx - w / 2; y = cy - h / 2; }
    const mx = w * .12, my = h * .25;
    x = Math.max(0, x - mx); y = Math.max(0, y - my);
    w = Math.min(vw - x, w + 2 * mx); h = Math.min(vh - y, h + 2 * my);
    return { x, y, w, h };
  }

  function recorteGris(v, z, rot) {
    const k = Math.min(1, 960 / Math.max(z.w, z.h));
    const w = Math.round(z.w * k), h = Math.round(z.h * k);
    const cv = Cam.canvas, ctx = Cam.ctx;
    if (rot) { cv.width = h; cv.height = w; } else { cv.width = w; cv.height = h; }
    ctx.save();
    if (rot) { ctx.translate(h, 0); ctx.rotate(Math.PI / 2); }
    ctx.drawImage(v, z.x, z.y, z.w, z.h, 0, 0, w, h);
    ctx.restore();
    const px = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const lum = new Uint8ClampedArray(cv.width * cv.height);
    for (let i = 0, j = 0; j < lum.length; i += 4, j++) lum[j] = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
    return { lum, w: cv.width, h: cv.height };
  }

  let bucleT;
  function bucle() {
    clearTimeout(bucleT);
    if (!Cam.activa || Cam.pausada) return;
    const v = $('#liveVideo');
    const sig = () => { bucleT = setTimeout(bucle, Cam.detector ? 60 : 40); };
    if (v.readyState < 2 || !v.videoWidth) return sig();
    Cam.ciclo++;
    if (Cam.detector) {
      Cam.detector.detect(v).then(r => {
        const ok = r && r.find(x => x.rawValue);
        if (ok) detectado(ok.rawValue);
        else if (Cam.worker && Cam.ciclo % 3 === 0) porWorker(v); // ayuda extra para códigos difíciles
      }).catch(() => { Cam.detector = null; }).finally(sig);
      return;
    }
    porWorker(v);
    sig();
  }
  function porWorker(v) {
    if (Cam.ocupado) return;
    // Alterna: horizontal, horizontal, vertical (por si el código está parado), y cada tanto modo "difícil"
    const paso = Cam.ciclo % 4;
    const vertical = paso === 2;
    const z = zonaLectura(v, vertical);
    const g = recorteGris(v, z, vertical);
    const hard = paso === 3;
    Cam.idPedido++;
    if (Cam.worker) {
      Cam.ocupado = true;
      Cam.worker.postMessage({ id: Cam.idPedido, lum: g.lum, w: g.w, h: g.h, hard }, [g.lum.buffer]);
      setTimeout(() => { Cam.ocupado = false; }, 600); // por si el worker no respondió
    } else if (ZX) {
      try {
        const res = new ZX.MultiFormatReader();
        res.setHints(zxHints);
        const r = res.decode(new ZX.BinaryBitmap(new ZX.HybridBinarizer(new ZX.RGBLuminanceSource(g.lum, g.w, g.h))));
        if (r) detectado(r.getText());
      } catch {}
    }
  }

  // Qué pasa cuando se reconoce un código
  function detectado(code) {
    code = String(code).trim();
    if (!code || !Cam.activa || Cam.pausada) return;
    const ahora = Date.now();
    const visto = Cam.ultimo[code] || 0;
    Cam.ultimo[code] = ahora;
    if (Cam.ignorar && Cam.ignorar.code === code && ahora < Cam.ignorar.hasta) return;
    if (Cam.modo === 'rafaga') {
      if (ahora - visto < 1500) return; // sigue en cuadro: no lo vuelve a contar
      sumarRafaga(code);
      return;
    }
    bip();
    // Congela la imagen para que se vea qué se leyó
    const v = $('#liveVideo'), img = $('#shotImg');
    try {
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      img.src = c.toDataURL('image/jpeg', .7); img.hidden = false;
    } catch {}
    pausar('✓ ' + code + ' · tocá para escanear otro');
    codigoLeido(code);
    // Lleva al formulario para completar
    const foco = S.dest === 'vencidos' ? '#fVence' : '#fNombre';
    setTimeout(() => {
      $('#itemForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (S.dest === 'vencidos' && $('#fNombre').value) $(foco).focus({ preventScroll: true });
    }, 250);
  }

  function codigoLeido(code) {
    const st = $('#scanStatus');
    st.className = 'status ok';
    st.textContent = `✓ Código leído: ${code}`;
    $('#fCodigo').value = code;
    $('#fNombre').value = '';
    buscarNombre(code);
  }

  // ---------- Modo ráfaga: cada lectura suma 1 a la planilla ----------
  const feed = [];
  function sumarRafaga(code) {
    let item;
    if (S.dest === 'vencidos') {
      const vence = $('#rVence').value;
      if (!vence) {
        pill('Elegí primero el vencimiento del lote', 'err');
        $('#rVence').focus({ preventScroll: true });
        if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
        return;
      }
      item = S.vencidos.find(x => x.codigo === code && x.vence === vence);
      if (item) item.cantidad += 1;
      else { item = { id: uid(), codigo: code, nombre: S.catalogo[code] || 'Buscando nombre…', cantidad: 1, vence, fecha: isoHoy(), cal: false }; S.vencidos.push(item); }
    } else {
      item = S.pedidos.find(x => x.codigo === code);
      if (item) item.cantidad = (item.cantidad || 0) + 1;
      else { item = { id: uid(), codigo: code, nombre: S.catalogo[code] || 'Buscando nombre…', cantidad: 1, fecha: isoHoy() }; S.pedidos.unshift(item); }
    }
    bip();
    guardar(); render();
    pill(`+1 ${item.nombre === 'Buscando nombre…' ? code : item.nombre} (${item.cantidad})`, 'ok');
    feed.unshift({ item, dest: S.dest, t: Date.now() });
    if (feed.length > 30) feed.pop();
    pintarFeed();
    if (item.nombre === 'Buscando nombre…') {
      consultarNombre(code).then(n => {
        const nuevo = n || 'Sin nombre (tocá ✎ para editar)';
        [...S.pedidos, ...S.vencidos].forEach(x => { if (x.codigo === code && x.nombre === 'Buscando nombre…') x.nombre = nuevo; });
        if (n) S.catalogo[code] = n;
        guardar(); render(); pintarFeed();
      });
    }
  }
  function pintarFeed() {
    $('#rafagaTotal').textContent = `${feed.length} lectura${feed.length === 1 ? '' : 's'}`;
    $('#feed').innerHTML = feed.slice(0, 12).map((f, i) => `
      <li><div class="f-n"><b>${esc(f.item.nombre)}</b><small>${esc(f.item.codigo)}${f.dest === 'vencidos' ? ' · vence ' + fmt(f.item.vence) : ''} · total ${f.item.cantidad || 0}</small></div>
      <span class="f-c">+1</span><button class="mini" data-menos="${i}" aria-label="Restar uno">−1</button></li>`).join('');
  }
  $('#feed').addEventListener('click', e => {
    const b = e.target.closest('[data-menos]');
    if (!b) return;
    const f = feed[+b.dataset.menos];
    const lista = S[f.dest];
    f.item.cantidad = (f.item.cantidad || 1) - 1;
    if (f.item.cantidad <= 0) { const i = lista.indexOf(f.item); if (i >= 0) lista.splice(i, 1); }
    feed.splice(+b.dataset.menos, 1);
    guardar(); render(); pintarFeed();
  });

  function setModo(m) {
    Cam.modo = m;
    $$('.chip[data-modo]').forEach(c => c.classList.toggle('on', c.dataset.modo === m));
    $('#rafagaPanel').hidden = m !== 'rafaga';
    $('#itemForm').hidden = m === 'rafaga';
    $('#rafagaPanel').classList.toggle('v', S.dest === 'vencidos');
    $('#rafagaDest').textContent = S.dest === 'pedidos' ? 'Pedidos' : 'A vencer';
    if (Cam.activa && Cam.pausada) reanudar();
    else if (Cam.activa) pill(m === 'rafaga' ? 'Ráfaga: pasá los productos' : 'Apuntá al código de barras');
  }
  $$('.chip[data-modo]').forEach(c => c.addEventListener('click', () => setModo(c.dataset.modo)));
  $$('.seg').forEach(s => s.addEventListener('click', () => setModo(Cam.modo)));

  // ---------- Foto (alternativa) ----------
  async function procesarFoto(file) {
    if (!file) return;
    pararVivo();
    const st = $('#scanStatus');
    st.className = 'status';
    st.textContent = 'Leyendo el código de la foto…';
    try {
      const { img, url } = await cargarImagen(file);
      const shot = $('#shotImg');
      if (shot.dataset.url) URL.revokeObjectURL(shot.dataset.url);
      shot.src = url; shot.dataset.url = url; shot.hidden = false;
      $('#camOff').hidden = true;
      $('#btnVivo').textContent = 'Volver a la cámara';
      await new Promise(r => setTimeout(r, 30));
      const code = (await leerConDetectorNativo(img)) || leerConZXing(img);
      if (code) { bip(); pill('✓ ' + code, 'ok'); codigoLeido(code); }
      else {
        st.className = 'status err';
        st.textContent = 'No se pudo leer. Probá más cerca, sin reflejos, o escribí el código a mano.';
        $('#fCodigo').focus();
      }
    } catch (e) {
      st.className = 'status err';
      st.textContent = 'No se pudo abrir la foto.';
    }
  }
  $('#fotoInput').addEventListener('change', e => { procesarFoto(e.target.files[0]); e.target.value = ''; });
  $('#galeriaInput').addEventListener('change', e => { procesarFoto(e.target.files[0]); e.target.value = ''; });

  // ---------- Nombre del producto ----------
  async function consultarNombre(code) {
    if (S.catalogo[code]) return S.catalogo[code];
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_es,brands,quantity`, { signal: ctl.signal });
      clearTimeout(to);
      const j = await r.json();
      const p = j && j.status === 1 ? j.product : null;
      const n = p && (p.product_name_es || p.product_name);
      if (!n) return null;
      const marca = (p.brands || '').split(',')[0].trim();
      return [n, marca && !n.toLowerCase().includes(marca.toLowerCase()) ? marca : '', p.quantity || ''].filter(Boolean).join(' ');
    } catch { return null; }
  }
  let busqueda = 0;
  async function buscarNombre(code) {
    const hint = $('#nombreHint');
    const nombre = $('#fNombre');
    const id = ++busqueda;
    if (S.catalogo[code]) {
      nombre.value = S.catalogo[code];
      hint.textContent = '· ya cargado antes';
      return;
    }
    hint.textContent = '· buscando…';
    const n = await consultarNombre(code);
    if (id !== busqueda) return;
    if (n) {
      if (!nombre.value.trim()) nombre.value = n;
      hint.textContent = '· sugerido, revisalo';
    } else {
      hint.textContent = '· no encontrado, escribilo';
      nombre.focus({ preventScroll: true });
    }
  }
  $('#fCodigo').addEventListener('change', e => {
    const c = e.target.value.trim();
    if (c && !$('#fNombre').value.trim()) buscarNombre(c);
  });

  function refrescarCatalogo() {
    $('#catalogoList').innerHTML = Object.values(S.catalogo).sort().map(n => `<option value="${esc(n)}">`).join('');
  }

  // ---------- Guardar ----------
  $('#itemForm').addEventListener('submit', e => {
    e.preventDefault();
    const codigo = $('#fCodigo').value.trim();
    const nombre = $('#fNombre').value.trim();
    if (!codigo || !nombre) return;
    S.catalogo[codigo] = nombre;

    if (S.dest === 'pedidos') {
      const cant = parseInt($('#fCantPedido').value, 10) || null;
      const ya = S.pedidos.find(p => p.codigo === codigo);
      if (ya) {
        ya.nombre = nombre;
        if (cant) ya.cantidad = (ya.cantidad || 0) + cant;
        toast('Ya estaba en Pedidos: se actualizó');
      } else {
        S.pedidos.unshift({ id: uid(), codigo, nombre, cantidad: cant, fecha: isoHoy() });
        toast('Guardado en Pedidos ✓', { label: 'Ver planilla', fn: () => ir('pedidos') });
      }
      guardar();
    } else {
      const cantidad = Math.max(1, parseInt($('#fCantidad').value, 10) || 1);
      const vence = $('#fVence').value;
      if (!vence) { $('#fVence').focus(); return; }
      let item = S.vencidos.find(v => v.codigo === codigo && v.vence === vence);
      if (item) { item.cantidad += cantidad; item.nombre = nombre; }
      else { item = { id: uid(), codigo, nombre, cantidad, vence, fecha: isoHoy(), cal: false }; S.vencidos.push(item); }
      guardar();
      if (S.cfg.autoCal && !item.cal) recordatorio(item, true);
      else toast('Guardado en A vencer ✓', { label: 'Ver planilla', fn: () => ir('vencidos') });
    }
    limpiarForm();
    render();
    // Vuelve a escanear solo, ignorando un momento el código recién guardado
    Cam.ignorar = { code: codigo, hasta: Date.now() + 2500 };
    $('#cam').scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (Cam.activa) reanudar(); else if ($('#view-escanear').classList.contains('active')) iniciarCamara();
  });

  function limpiarForm() {
    $('#fCodigo').value = '';
    $('#fNombre').value = '';
    $('#fCantidad').value = 1;
    $('#fCantPedido').value = '';
    $('#fVence').value = '';
    $('#nombreHint').textContent = '';
    $('#scanStatus').textContent = 'Guardado ✓ Apuntá al próximo código.';
    $('#scanStatus').className = 'status ok';
  }

  // ---------- Código de barras dibujado ----------
  function formatoBarra(code) {
    const ean = s => { const d = s.split('').map(Number); const chk = d.pop(); const sum = d.reverse().reduce((a, n, i) => a + n * (i % 2 ? 1 : 3), 0); return (10 - sum % 10) % 10 === chk; };
    if (/^\d{13}$/.test(code) && ean(code)) return 'EAN13';
    if (/^\d{8}$/.test(code) && ean(code)) return 'EAN8';
    if (/^\d{12}$/.test(code) && ean(code)) return 'UPC';
    return 'CODE128';
  }
  function barraSVG(code) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      JsBarcode(svg, code, { format: formatoBarra(code), displayValue: false, height: 30, margin: 0, width: 1.2, background: 'transparent', lineColor: '#25300A' });
      svg.setAttribute('preserveAspectRatio', 'none');
      return svg.outerHTML;
    } catch { return ''; }
  }
  function barraPNG(code) {
    const cv = document.createElement('canvas');
    try {
      JsBarcode(cv, code, { format: formatoBarra(code), displayValue: true, fontSize: 18, textMargin: 2, height: 60, margin: 6, width: 2, background: '#ffffff', lineColor: '#000000', font: 'Helvetica' });
      return { data: cv.toDataURL('image/png'), w: cv.width, h: cv.height };
    } catch { return null; }
  }

  // ---------- Estado de vencimiento ----------
  function estado(v) {
    const d = diasHasta(v.vence);
    if (d < 0) return { cls: 'bad', txt: `Vencido hace ${-d} d`, pdf: 'VENCIDO', col: [217, 69, 43] };
    if (d === 0) return { cls: 'bad', txt: 'Vence hoy', pdf: 'VENCE HOY', col: [217, 69, 43] };
    if (d <= 7) return { cls: 'warn', txt: `Vence en ${d} d`, pdf: `${d} DÍAS`, col: [227, 155, 18] };
    return { cls: 'ok', txt: `En ${d} días`, pdf: `${d} DÍAS`, col: [94, 122, 18] };
  }

  // ---------- Render ----------
  const ICO = {
    edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    del: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/></svg>'
  };
  const coincide = (it, q) => !q || (it.nombre + ' ' + it.codigo).toLowerCase().includes(q.toLowerCase());

  function render() {
    const ped = S.pedidos.filter(p => coincide(p, S.filtro.pedidos));
    $('#tbPedidos').innerHTML = ped.map(p => `
      <tr data-id="${p.id}" data-k="pedidos">
        <td class="code">${barraSVG(p.codigo)}${esc(p.codigo)}</td>
        <td class="name">${esc(p.nombre)}</td>
        <td class="num" data-l="Cant.">${p.cantidad || '—'}</td>
        <td class="acts"><button class="mini" data-act="edit" aria-label="Editar">${ICO.edit}</button><button class="mini del" data-act="del" aria-label="Borrar">${ICO.del}</button></td>
      </tr>`).join('');
    $('#emptyPedidos').hidden = ped.length > 0;

    const ven = [...S.vencidos].sort((a, b) => a.vence.localeCompare(b.vence)).filter(v => coincide(v, S.filtro.vencidos));
    $('#tbVencidos').innerHTML = ven.map(v => {
      const e = estado(v);
      return `
      <tr data-id="${v.id}" data-k="vencidos">
        <td class="code">${barraSVG(v.codigo)}${esc(v.codigo)}</td>
        <td class="name">${esc(v.nombre)}</td>
        <td class="num" data-l="Cant.">${v.cantidad}</td>
        <td class="venc"><span>${fmt(v.vence)}</span> <span class="badge ${e.cls}">${e.txt}</span></td>
        <td class="acts"><button class="mini cal ${v.cal ? 'done' : ''}" data-act="cal" aria-label="Recordatorio en Google Calendar" title="${v.cal ? 'Recordatorio creado' : 'Crear recordatorio'}">${ICO.cal}</button><button class="mini" data-act="edit" aria-label="Editar">${ICO.edit}</button><button class="mini del" data-act="del" aria-label="Borrar">${ICO.del}</button></td>
      </tr>`;
    }).join('');
    $('#emptyVencidos').hidden = ven.length > 0;

    // Contadores
    const np = S.pedidos.length, nv = S.vencidos.length;
    const plural = n => `${n} producto${n === 1 ? '' : 's'}`;
    $('#stPedidos').textContent = np;
    $('#stVencidos').textContent = nv;
    $('#stSemana').textContent = S.vencidos.filter(v => { const d = diasHasta(v.vence); return d >= 0 && d <= 7; }).length;
    $('#stYa').textContent = S.vencidos.filter(v => diasHasta(v.vence) < 0).length;
    $('#cntPedidos').textContent = $('#shPedidos').textContent = plural(np);
    $('#cntVencidos').textContent = $('#shVencidos').textContent = plural(nv);

    const prox = [...S.vencidos].sort((a, b) => a.vence.localeCompare(b.vence)).slice(0, 5);
    $('#proximos').innerHTML = prox.length ? prox.map(v => {
      const e = estado(v);
      return `<li><div style="min-width:0"><div class="nm">${esc(v.nombre)}</div><div class="cd">${esc(v.codigo)} · ${v.cantidad} u. · ${fmt(v.vence)}</div></div><span class="badge ${e.cls}">${e.txt}</span></li>`;
    }).join('') : '<li class="muted">Sin vencimientos cargados.</li>';
    refrescarCatalogo();
  }

  $$('[data-search]').forEach(i => i.addEventListener('input', () => { S.filtro[i.dataset.search] = i.value; render(); }));

  // Acciones de fila
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const tr = b.closest('tr');
    const k = tr.dataset.k;
    const item = S[k].find(x => x.id === tr.dataset.id);
    if (!item) return;
    if (b.dataset.act === 'del') {
      const i = S[k].indexOf(item);
      S[k].splice(i, 1); guardar(); render();
      toast('Producto borrado', { label: 'Deshacer', fn: () => { S[k].splice(i, 0, item); guardar(); render(); } });
    } else if (b.dataset.act === 'edit') editar(k, item);
    else if (b.dataset.act === 'cal') recordatorio(item, false);
  });

  function editar(k, item) {
    const dlg = $('#dlgEditar');
    $('#editTitulo').textContent = k === 'pedidos' ? 'Editar pedido' : 'Editar vencido';
    $('#eCodigo').value = item.codigo;
    $('#eNombre').value = item.nombre;
    $('#eCantidad').value = item.cantidad || '';
    $('#eVence').value = item.vence || '';
    $('.e-venc', dlg).style.display = k === 'vencidos' ? '' : 'none';
    $('#eVence').required = k === 'vencidos';
    dlg.onclose = () => {
      if (dlg.returnValue !== 'ok') return;
      item.codigo = $('#eCodigo').value.trim();
      item.nombre = $('#eNombre').value.trim();
      const c = parseInt($('#eCantidad').value, 10);
      if (k === 'pedidos') item.cantidad = c || null;
      else {
        item.cantidad = Math.max(1, c || 1);
        if ($('#eVence').value !== item.vence) { item.vence = $('#eVence').value; item.cal = false; }
      }
      S.catalogo[item.codigo] = item.nombre;
      guardar(); render();
      if (k === 'vencidos' && !item.cal) toast('Cambió la fecha', { label: 'Nuevo recordatorio', fn: () => recordatorio(item, false) });
    };
    dlg.returnValue = '';
    dlg.showModal();
  }

  // ---------- Google Calendar ----------
  function fechaAviso(v) {
    const aviso = addDays(v.vence, -Math.max(0, +S.cfg.dias || 0));
    return aviso < isoHoy() ? isoHoy() : aviso;
  }
  function textoEvento(v) {
    return {
      titulo: `⚠ Vence: ${v.nombre} (${v.cantidad} u.)`,
      detalle: `Producto: ${v.nombre}\nCódigo de barras: ${v.codigo}\nCantidad: ${v.cantidad}\nVencimiento: ${fmt(v.vence)}\n${S.cfg.sucursal ? 'Local: ' + S.cfg.sucursal + '\n' : ''}— Belgrano · siempre de tu lado`
    };
  }
  function urlGoogleCalendar(v) {
    const dia = fechaAviso(v);
    const { titulo, detalle } = textoEvento(v);
    const p = new URLSearchParams({
      action: 'TEMPLATE',
      text: titulo,
      dates: `${compact(dia)}/${compact(addDays(dia, 1))}`,
      details: detalle + (dia !== v.vence ? `\n\n(Aviso ${diasHasta(v.vence) - diasHasta(dia)} días antes del vencimiento)` : '')
    });
    return 'https://calendar.google.com/calendar/render?' + p.toString();
  }

  // API directa (opcional, con Client ID propio)
  let gToken = null, gTokenExp = 0, gisCargado = null;
  function cargarGIS() {
    if (gisCargado) return gisCargado;
    gisCargado = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = ok; s.onerror = mal;
      document.head.appendChild(s);
    });
    return gisCargado;
  }
  async function tokenGoogle() {
    if (gToken && Date.now() < gTokenExp) return gToken;
    await cargarGIS();
    return new Promise((ok, mal) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: S.cfg.clientId,
        scope: 'https://www.googleapis.com/auth/calendar.events',
        callback: r => {
          if (r.error) return mal(r);
          gToken = r.access_token; gTokenExp = Date.now() + (r.expires_in - 60) * 1000; ok(gToken);
        },
        error_callback: mal
      });
      tc.requestAccessToken({ prompt: gToken ? '' : 'consent' });
    });
  }
  async function crearEventoAPI(v) {
    const token = await tokenGoogle();
    const { titulo, detalle } = textoEvento(v);
    const dias = Math.max(0, +S.cfg.dias || 0);
    const overrides = [{ method: 'popup', minutes: 15 * 60 }]; // 9:00 del día anterior
    if (dias > 1) overrides.push({ method: 'popup', minutes: Math.min(40320, dias * 1440 - 540) }); // 9:00, N días antes
    const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: titulo, description: detalle,
        start: { date: v.vence }, end: { date: addDays(v.vence, 1) },
        colorId: '5', reminders: { useDefault: false, overrides }
      })
    });
    if (!r.ok) throw new Error('Calendar ' + r.status);
  }

  function recordatorio(v, alGuardar) {
    const marcar = () => { v.cal = true; guardar(); render(); };
    if (S.cfg.clientId && !NATIVO) {
      crearEventoAPI(v).then(() => { marcar(); toast('Recordatorio creado en Google Calendar ✓'); })
        .catch(() => toast('No se pudo crear automático', { label: 'Abrir Calendar', fn: () => { abrirExterno(urlGoogleCalendar(v)); marcar(); } }));
      return;
    }
    // Sin API: abre Google Calendar con el evento armado (tocar "Guardar")
    const w = abrirExterno(urlGoogleCalendar(v));
    if (w) { marcar(); if (alGuardar) toast('Guardado en A vencer ✓ · confirmá el evento en Calendar'); }
    else toast('Guardado ✓', { label: 'Crear recordatorio', fn: () => { abrirExterno(urlGoogleCalendar(v)); marcar(); } });
  }

  // Exportar todos los recordatorios (.ics) — se importa en Google Calendar
  $('#btnIcs').addEventListener('click', () => {
    if (!S.vencidos.length) return toast('No hay vencidos cargados');
    const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
    const ahora = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const dias = Math.max(0, +S.cfg.dias || 0);
    const ev = S.vencidos.map(v => {
      const { titulo, detalle } = textoEvento(v);
      return ['BEGIN:VEVENT', `UID:${v.id}@la-esquina`, `DTSTAMP:${ahora}`,
        `DTSTART;VALUE=DATE:${compact(v.vence)}`, `DTEND;VALUE=DATE:${compact(addDays(v.vence, 1))}`,
        `SUMMARY:${icsEsc(titulo)}`, `DESCRIPTION:${icsEsc(detalle)}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(titulo)}`, `TRIGGER:-P${dias}DT15H`, 'END:VALARM',
        'END:VEVENT'].join('\r\n');
    });
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Belgrano//Vencidos//ES', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n');
    descargar(new Blob([ics], { type: 'text/calendar' }), `vencimientos-${isoHoy()}.ics`);
    toast('Abrí el archivo para agregarlo a Google Calendar');
  });

  // ---------- PDF ----------
  let logoCache;
  async function logoData() {
    if (logoCache !== undefined) return logoCache;
    try {
      const b = await (await fetch('img/logo-blanco.png')).blob();
      logoCache = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
    } catch { logoCache = null; }
    return logoCache;
  }

  async function armarPDF(tipo) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const verde = [152, 184, 40], tinta = [37, 48, 10];
    const logo = await logoData();
    const titulo = tipo === 'pedidos' ? 'Planilla de Pedidos' : 'Planilla A vencer';
    const hoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const encabezado = () => {
      doc.setFillColor(...verde); doc.rect(0, 0, W, 30, 'F');
      doc.setFillColor(234, 221, 18); doc.rect(0, 30, W, 1.4, 'F');
      if (logo) doc.addImage(logo, 'PNG', 12, 4.5, 44, 21.8);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
      doc.text(titulo, W - 12, 14, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
      doc.text([S.cfg.sucursal || 'Belgrano', hoy.charAt(0).toUpperCase() + hoy.slice(1)], W - 12, 20, { align: 'right' });
    };

    let filas, columnas, estilosCol;
    const items = tipo === 'pedidos' ? S.pedidos : [...S.vencidos].sort((a, b) => a.vence.localeCompare(b.vence));
    const barras = items.map(it => barraPNG(it.codigo));
    if (tipo === 'pedidos') {
      const conCant = items.some(p => p.cantidad);
      columnas = ['#', 'Código de barras', 'Producto', ...(conCant ? ['Cant.'] : [])];
      filas = items.map((p, i) => [i + 1, '', p.nombre, ...(conCant ? [p.cantidad || ''] : [])]);
      estilosCol = { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 58 }, 3: { cellWidth: 18, halign: 'center' } };
    } else {
      columnas = ['#', 'Código de barras', 'Producto', 'Cant.', 'Vencimiento', 'Estado'];
      filas = items.map((v, i) => [i + 1, '', v.nombre, v.cantidad, fmt(v.vence), estado(v).pdf]);
      estilosCol = { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 52 }, 3: { cellWidth: 14, halign: 'center' }, 4: { cellWidth: 26, halign: 'center' }, 5: { cellWidth: 24, halign: 'center', fontStyle: 'bold' } };
    }

    doc.autoTable({
      head: [columnas], body: filas,
      startY: 38, margin: { top: 38, left: 12, right: 12, bottom: 18 },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 10, textColor: tinta, lineColor: [225, 230, 205], lineWidth: .2, valign: 'middle', cellPadding: 2.4, minCellHeight: 19 },
      headStyles: { fillColor: [61, 79, 11], textColor: 255, fontStyle: 'bold', minCellHeight: 9 },
      alternateRowStyles: { fillColor: [247, 249, 238] },
      columnStyles: estilosCol,
      didParseCell: d => {
        if (tipo === 'vencidos' && d.section === 'body' && d.column.index === 5) d.cell.styles.textColor = estado(items[d.row.index]).col;
      },
      didDrawCell: d => {
        if (d.section !== 'body' || d.column.index !== 1) return;
        const b = barras[d.row.index];
        if (!b) { doc.setFontSize(9); doc.text(items[d.row.index].codigo, d.cell.x + 2, d.cell.y + d.cell.height / 2); return; }
        const maxW = d.cell.width - 4, maxH = d.cell.height - 3;
        const k = Math.min(maxW / b.w, maxH / b.h);
        const w = b.w * k, h = b.h * k;
        doc.addImage(b.data, 'PNG', d.cell.x + (d.cell.width - w) / 2, d.cell.y + (d.cell.height - h) / 2, w, h);
      },
      willDrawPage: encabezado
    });

    // Resumen + pie
    let y = doc.lastAutoTable.finalY + 8;
    doc.setFontSize(10); doc.setTextColor(...tinta); doc.setFont('helvetica', 'bold');
    if (y > doc.internal.pageSize.getHeight() - 24) { doc.addPage(); encabezado(); y = 40; }
    if (tipo === 'pedidos') doc.text(`Total de productos: ${items.length}`, 12, y);
    else {
      const unidades = items.reduce((a, v) => a + v.cantidad, 0);
      const ya = items.filter(v => diasHasta(v.vence) < 0).length;
      doc.text(`Total de productos: ${items.length}   ·   Unidades: ${unidades}   ·   Ya vencidos: ${ya}`, 12, y);
    }
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      const H = doc.internal.pageSize.getHeight();
      doc.setDrawColor(...verde); doc.setLineWidth(.4); doc.line(12, H - 12, W - 12, H - 12);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(120, 130, 95);
      doc.text('Belgrano · siempre de tu lado', 12, H - 7);
      doc.text(`Página ${i} de ${n}`, W - 12, H - 7, { align: 'right' });
    }
    const nombre = `${tipo === 'pedidos' ? 'Pedidos' : 'AVencer'}_Belgrano_${isoHoy()}.pdf`;
    return new File([doc.output('blob')], nombre, { type: 'application/pdf' });
  }

  function descargar(blob, nombre) {
    if (NATIVO) {
      const f = blob instanceof File ? blob : new File([blob], nombre, { type: blob.type });
      compartirNativo([f], nombre).catch(() => toast('No se pudo abrir el archivo'));
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  const mensaje = tipos => `Hola! Te paso ${tipos.length > 1 ? 'las planillas' : 'la planilla'} de ${tipos.map(t => t === 'pedidos' ? 'Pedidos' : 'A vencer').join(' y ')} de ${S.cfg.sucursal || 'Belgrano'} (${fmt(isoHoy())}).`;

  async function compartir(tipos, via) {
    tipos = tipos.filter(t => S[t].length);
    if (!tipos.length) return toast('La planilla está vacía');
    toast('Armando PDF…');
    let files;
    try { files = await Promise.all(tipos.map(armarPDF)); }
    catch (e) { console.error(e); return toast('No se pudo armar el PDF'); }
    const texto = mensaje(tipos);
    if (NATIVO) {
      try { await compartirNativo(files, texto); } catch { toast('No se pudo compartir'); }
      return;
    }
    // 1) Menú de compartir del teléfono (WhatsApp, Gmail…) con el PDF adjunto
    if (navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files, title: 'Belgrano · Planillas', text: texto }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    // 2) Sin soporte: descarga el PDF y abre la app elegida para adjuntarlo
    files.forEach(f => descargar(f, f.name));
    if (via === 'whatsapp') {
      const num = (S.cfg.wa || '').replace(/\D/g, '');
      abrirExterno(`https://wa.me/${num}?text=${encodeURIComponent(texto + ' (adjunto el PDF)')}`, '_blank');
    } else if (via === 'gmail') {
      const p = new URLSearchParams({ view: 'cm', fs: '1', to: S.cfg.mail || '', su: `Belgrano · ${tipos.map(t => t === 'pedidos' ? 'Pedidos' : 'A vencer').join(' y ')} ${fmt(isoHoy())}`, body: texto + '\n\nAdjunto el PDF.' });
      abrirExterno('https://mail.google.com/mail/?' + p.toString());
    }
    toast('PDF descargado ✓ adjuntalo en el mensaje');
  }

  document.addEventListener('click', async e => {
    const pdf = e.target.closest('[data-pdf]');
    if (pdf) {
      const t = pdf.dataset.pdf;
      if (!S[t].length) return toast('La planilla está vacía');
      try { const f = await armarPDF(t); descargar(f, f.name); toast('PDF listo ✓'); }
      catch (err) { console.error(err); toast('No se pudo armar el PDF'); }
      return;
    }
    const sh = e.target.closest('[data-share]');
    if (sh) return compartir([sh.dataset.share]);
    const dr = e.target.closest('[data-direct]');
    if (dr) return compartir(['pedidos', 'vencidos'], dr.dataset.direct);
    const cl = e.target.closest('[data-clear]');
    if (cl) {
      const t = cl.dataset.clear;
      if (!S[t].length) return toast('Ya está vacía');
      if (!confirm(`¿Vaciar la planilla de ${t === 'pedidos' ? 'Pedidos' : 'A vencer'}? (${S[t].length} productos)`)) return;
      const copia = S[t]; S[t] = []; guardar(); render();
      toast('Planilla vaciada', { label: 'Deshacer', fn: () => { S[t] = copia; guardar(); render(); } });
    }
  });

  // ---------- Ajustes ----------
  $('#btnAjustes').addEventListener('click', () => {
    $('#aSucursal').value = S.cfg.sucursal;
    $('#aDias').value = S.cfg.dias;
    $('#aAutoCal').checked = S.cfg.autoCal;
    $('#aWa').value = S.cfg.wa;
    $('#aMail').value = S.cfg.mail;
    $('#aClientId').value = S.cfg.clientId;
    const d = $('#dlgAjustes');
    d.returnValue = '';
    d.onclose = () => {
      if (d.returnValue !== 'ok') return;
      S.cfg = {
        sucursal: $('#aSucursal').value.trim(),
        dias: Math.min(28, Math.max(0, parseInt($('#aDias').value, 10) || 0)),
        autoCal: $('#aAutoCal').checked,
        wa: $('#aWa').value.trim(),
        mail: $('#aMail').value.trim(),
        clientId: $('#aClientId').value.trim()
      };
      store.set('le_cfg', S.cfg);
      toast('Ajustes guardados ✓');
    };
    d.showModal();
  });

  // ---------- Inicio ----------
  const hoyTxt = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#hoyTxt').textContent = hoyTxt;
  setDest('pedidos');
  render();
  const inicial = location.hash.slice(1);
  // Pantalla de inicio: se muestra al abrir y se cierra sola (o tocándola)
  const splash = $('#splash');
  let splashListo = false;
  const cerrarSplash = () => {
    if (splashListo) return;
    splashListo = true;
    splash.classList.add('fuera');
    document.body.classList.remove('splash-on');
    setTimeout(() => splash.remove(), 600);
    ir($(`#view-${inicial}`) ? inicial : 'inicio');
  };
  let yaVisto = false;
  try { yaVisto = sessionStorage.getItem('le_splash') === '1'; sessionStorage.setItem('le_splash', '1'); } catch {}
  if (yaVisto || matchMedia('(prefers-reduced-motion: reduce)').matches) { splash.remove(); requestAnimationFrame(() => ir($(`#view-${inicial}`) ? inicial : 'inicio')); splashListo = true; }
  else {
    document.body.classList.add('splash-on');
    splash.addEventListener('click', cerrarSplash);
    setTimeout(cerrarSplash, 2600);
  }

  if (!NATIVO && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
