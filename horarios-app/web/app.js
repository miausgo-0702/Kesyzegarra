(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const { parseYMD, ymd, addDays, lunesDe, norm } = L;
  const B = window.Backend;
  const SEED = L.getData();
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const MESES_L = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const corto = d => d.getDate() + " " + MESES[d.getMonth()];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hoy = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  const iniciales = n => String(n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join("").toUpperCase();
  const corta = h => h === "Franco" ? "Franco" : h === "Horario a confirmar" ? "Trabajo" : String(h).split(" · ").map(x => x.replace(/ a /, "-")).join(" ");
  const fechaLarga = d => DIAS[d.getDay()] + " " + d.getDate() + " de " + MESES_L[d.getMonth()].toLowerCase();

  const st = {
    user: null, datos: null, cambios: [], avisos: [], empleados: [],
    vista: "inicio", fecha: hoy(), mes: null, ver: null,
    adminTab: "empleados", ed: null, animando: false, pendiente: undefined,
  };
  st.mes = new Date(st.fecha.getFullYear(), st.fecha.getMonth(), 1);

  function toast(t) { const el = $("toast"); el.textContent = t; el.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("on"), 2600); }

  /* ============================== INGRESO ============================== */
  function pinBox(cont, onFull) {
    cont.innerHTML = "";
    const ins = [0, 1, 2, 3].map(i => {
      const x = document.createElement("input");
      x.inputMode = "numeric"; x.maxLength = 1; x.type = "password"; x.autocomplete = "off"; x.setAttribute("aria-label", "Dígito " + (i + 1));
      x.addEventListener("input", () => {
        x.value = x.value.replace(/\D/g, "").slice(-1);
        cont.classList.remove("err");
        if (x.value && i < 3) ins[i + 1].focus();
        if (x.value && i === 3 && onFull) onFull();
      });
      x.addEventListener("keydown", e => { if (e.key === "Backspace" && !x.value && i > 0) { ins[i - 1].focus(); ins[i - 1].value = ""; } });
      x.addEventListener("paste", e => {
        const t = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 4);
        if (t.length) { e.preventDefault(); t.split("").forEach((c, k) => ins[k].value = c); ins[Math.min(t.length, 3)].focus(); if (t.length === 4 && onFull) onFull(); }
      });
      cont.appendChild(x); return x;
    });
    const chk = document.createElement("div"); chk.className = "check";
    chk.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    cont.appendChild(chk);
    return {
      get: () => ins.map(x => x.value).join(""),
      clear() { ins.forEach(x => x.value = ""); cont.classList.remove("ok", "err"); },
      error() { cont.classList.remove("err"); void cont.offsetWidth; cont.classList.add("err"); ins.forEach(x => x.value = ""); ins[0].focus(); },
      ok() { cont.classList.add("ok"); },
      focus() { ins[0].focus(); },
    };
  }
  const pIn = pinBox($("inPin"), () => $("bIngresar").click());
  const pRg = pinBox($("rgPin"), () => document.querySelector("#rgPin2 input").focus());
  const pRg2 = pinBox($("rgPin2"));

  let modoLogin = "ingresar";
  function setModo(m) {
    modoLogin = m;
    document.querySelectorAll(".glinks .chip").forEach(c => c.classList.toggle("on", c.dataset.modo === m));
    $("fIngresar").classList.toggle("oculto", m !== "ingresar");
    $("fRegistro").classList.toggle("oculto", m !== "registro");
    $("fAdmin").classList.toggle("oculto", m !== "admin");
    $("lgTitulo").textContent = m === "admin" ? "Administración" : m === "registro" ? "Crear cuenta" : "Mis Horarios";
    $("lgSub").textContent = m === "admin" ? "Ingreso solo para administradores" : m === "registro" ? "Registrate una sola vez con tu DNI" : "Ingresá con tu DNI y tu PIN de 4 números";
    $("lgMsg").textContent = "";
    if (m === "registro") llenarRegistro();
  }
  document.querySelectorAll(".glinks .chip").forEach(c => c.onclick = () => setModo(c.dataset.modo));

  async function llenarRegistro() {
    const secs = L.datos().SECTORES;
    $("rgSector").innerHTML = secs.map((s, i) => `<option value="${i}">${esc(s.nombre)}</option>`).join("");
    const ocup = await B.ocupadas().catch(() => new Set());
    const pers = () => {
      const s = secs[$("rgSector").value];
      $("rgPersona").innerHTML = `<option value="">Elegí tu nombre…</option>` + s.personas.map(p => {
        const usado = ocup.has(B.keyPersona(p.n));
        return `<option value="${esc(p.n)}" ${usado ? "disabled" : ""}>${esc(p.n)}${usado ? " (ya registrado)" : ""}</option>`;
      }).join("");
    };
    $("rgSector").onchange = pers; pers();
  }

  function boton(b, estado, texto) {
    b.classList.remove("cargando", "ok"); b.disabled = estado === "cargando" || estado === "ok";
    if (estado) b.classList.add(estado);
    b.innerHTML = estado === "cargando" ? `<span class="spin"></span>${texto || "Verificando…"}` : estado === "ok" ? "✓ " + (texto || "Verificado") : texto;
  }
  const msg = t => { $("lgMsg").textContent = t || ""; };
  async function exito(pin, btn) {
    if (pin) pin.ok(); boton(btn, "ok");
    await new Promise(r => setTimeout(r, 1100));
    st.animando = false;
    if (st.pendiente !== undefined) { const u = st.pendiente; st.pendiente = undefined; aplicarUsuario(u); }
  }

  $("fIngresar").onsubmit = async e => {
    e.preventDefault(); msg("");
    const dni = $("inDni").value.replace(/\D/g, ""), pin = pIn.get();
    if (dni.length < 7) { msg("Ingresá tu DNI."); return $("inDni").focus(); }
    if (pin.length < 4) { msg("Completá los 4 números del PIN."); return pIn.error(); }
    st.animando = true; boton($("bIngresar"), "cargando");
    try { await B.ingresar(dni, pin); await exito(pIn, $("bIngresar")); }
    catch (er) { st.animando = false; boton($("bIngresar"), null, "Verificar"); msg(er.message); pIn.error(); }
  };
  $("fRegistro").onsubmit = async e => {
    e.preventDefault(); msg("");
    const dni = $("rgDni").value.replace(/\D/g, ""), persona = $("rgPersona").value, a = pRg.get(), b = pRg2.get();
    if (dni.length < 7) { msg("Ingresá tu DNI (solo números)."); return $("rgDni").focus(); }
    if (!persona) return msg("Elegí tu nombre de la lista.");
    if (a.length < 4) { msg("El PIN tiene que tener 4 números."); return pRg.error(); }
    if (a !== b) { msg("Los PIN no coinciden."); pRg2.error(); return; }
    st.animando = true; boton($("bRegistrar"), "cargando", "Creando cuenta…");
    try { await B.registrar(dni, a, persona); await exito(pRg2, $("bRegistrar")); }
    catch (er) { st.animando = false; boton($("bRegistrar"), null, "Crear cuenta"); msg(er.message); }
  };
  $("fAdmin").onsubmit = async e => {
    e.preventDefault(); msg("");
    st.animando = true; boton($("bAdmin"), "cargando");
    try { await B.ingresarAdmin($("adUser").value, $("adPass").value); await exito(null, $("bAdmin")); }
    catch (er) { st.animando = false; boton($("bAdmin"), null, "Ingresar"); msg(er.message); $("adPass").value = ""; $("glass").animate([{ transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "none" }], 300); }
  };

  function mostrarLogin(aviso) {
    $("app").classList.add("oculto"); $("login").classList.remove("oculto");
    boton($("bIngresar"), null, "Verificar"); boton($("bRegistrar"), null, "Crear cuenta"); boton($("bAdmin"), null, "Ingresar");
    pIn.clear(); pRg.clear(); pRg2.clear(); $("adPass").value = "";
    setModo(modoLogin === "admin" ? "admin" : "ingresar");
    if (aviso) msg(aviso);
    $("lgModo").textContent = B.online ? "Conectado · datos compartidos" : "Modo local · los datos quedan en este dispositivo";
  }

  /* ============================== SESIÓN ============================== */
  function aplicarUsuario(u, aviso) {
    st.user = u;
    if (!u) return mostrarLogin(aviso);
    $("login").classList.add("oculto"); $("app").classList.remove("oculto");
    st.vista = "inicio"; st.fecha = hoy(); st.mes = new Date(st.fecha.getFullYear(), st.fecha.getMonth(), 1);
    if (u.tipo === "admin") {
      const ps = L.personas(); st.ver = st.ver && L.ubicar(st.ver) ? st.ver : (ps[0] && ps[0].n);
      if (B.online && st.datosCargados && !st.datos) B.guardarDatos(SEED).catch(() => {});
    }
    if (u.tipo === "admin" && !IA.perfil) B.leerPerfil(u.clave).then(p => { if (p && p.nombreCompleto) { IA.perfil = p; if (st.user) render(); } }).catch(() => {});
    armarNav(); render();
    if (u.tipo === "empleado") Notif.sesion(B.sesionNativa(u.persona)); else Notif.sesion(null);
    if (B.online) setTimeout(async () => { await Notif.pedir(); registrarPush(); }, 2500);
    procesarNotifs(true);
    if (location.hash === "#notificaciones") { history.replaceState(null, "", location.pathname); abrirNotificaciones(); }
  }
  B.onUser((u, aviso) => {
    if (st.animando) { st.pendiente = u; return; }
    aplicarUsuario(u, aviso);
  });
  let renderPendiente = 0;
  function renderPronto() { if (renderPendiente || !st.user) return; renderPendiente = requestAnimationFrame(() => { renderPendiente = 0; if (st.user) render(); }); }
  B.on("datos", d => {
    st.datosCargados = true;
    st.datos = d;
    L.setData(d || SEED); olvidar();
    if (!d && st.user && st.user.tipo === "admin" && B.online) B.guardarDatos(SEED).catch(() => {});
    renderPronto();
  });
  B.on("ofertas", l => Ofertas.setLista(l));
  B.on("cambios", c => { st.cambios = c || []; olvidar(); if (st.user) { renderPronto(); procesarNotifs(); } });
  B.on("avisos", a => { st.avisos = a || []; renderPronto(); });
  B.on("empleados", e => { st.empleados = (e || []).sort((a, b) => (a.persona || "").localeCompare(b.persona || "")); renderPronto(); });
  $("bSalir").onclick = async () => {
    if (!confirm("¿Cerrar sesión?")) return;
    Notif.sesion(null); cerrarVivo(); IA.cargado = null; IA.perfil = null;
    (IA.caras || []).forEach(c => c && c.destroy()); IA.caras = null;
    if ($("v-ia")) $("v-ia").innerHTML = "";
    if ($("v-ofertas")) $("v-ofertas").innerHTML = "";
    if (st.token) { await B.borrarToken(st.token).catch(() => {}); st.token = null; }
    B.salir();
  };
  // registra este dispositivo para recibir notificaciones push con la app cerrada
  async function registrarPush() {
    if (!st.user || !B.online) return;
    const t = await Notif.token();
    if (!t) return;
    try { await B.registrarToken(t.token, t.plataforma); st.token = t.token; } catch (e) { console.warn(e); }
  }
  window.registrarPush = registrarPush;

  /* ============================== NAVEGACIÓN ============================== */
  const ICON = {
    inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/></svg>',
    calendario: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>',
    equipo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.5c2.6.2 4.2 2 4.5 4.5"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  };
  ICON.ia = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>';
  ICON.ofertas = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><path d="m15 9-6 6"/><path d="M9 9h.01"/><path d="M15 15h.01"/></svg>';
  const NOMBRES = { inicio: "Inicio", calendario: "Calendario", equipo: "Equipo", ofertas: "Ofertas", admin: "Panel", ia: "IA" };
  // Color de la "gota" de cada pestaña (colores de la marca)
  const COLOR = { inicio: "#b3bb06", calendario: "#eadd12", equipo: "#a3509a", ofertas: "#e8590c", admin: "#d6dd3c", ia: "#65265d" };
  let navItems = [];
  function montarTema() {
    if (st.tema || !$("temaSlot")) return;
    const meta = document.querySelector('meta[name="theme-color"]');
    st.tema = SunMoonThemeToggle.create({ size: 40, storageKey: "mh_tema", duration: 1400,
      onThemeChange: t => { if (meta) meta.content = t === "dark" ? "#121409" : "#3a4108"; } });
    $("temaSlot").appendChild(st.tema.el);
  }
  function armarNav() {
    montarTema();
    navItems = ["inicio", "calendario", "equipo", "ofertas"].concat(st.user.tipo === "admin" ? ["ia", "admin"] : []);
    $("nav").innerHTML = `<div class="nav-glow" id="navGlow"></div>
      <svg class="nav-svg" id="navSvg" aria-hidden="true"><path id="navPath"/></svg>
      <div class="bead" id="bead"><div class="bead-in" id="beadIn"></div></div>` +
      navItems.map(v => `<button data-v="${v}" aria-label="${NOMBRES[v]}">${ICON[v]}<span>${NOMBRES[v]}</span></button>`).join("");
    $("nav").classList.toggle("muchos", navItems.length > 5);
    $("side").innerHTML = `<img class="logo" src="img/logo.svg" alt=""><div class="side-ind" id="sideInd"></div>` +
      navItems.map(v => `<button data-v="${v}" title="${NOMBRES[v]}">${ICON[v]}</button>`).join("");
    document.querySelectorAll("[data-v]").forEach(b => b.onclick = () => irA(b.dataset.v));
    st.vistaAnt = null;
    Gota.iniciar();
  }
  function irA(v) {
    if (v === st.vista) return;
    st.vista = v; render(); if (window.scrollY > 0) window.scrollTo(0, 0);
  }
  function moverGota(animar) {
    const x = Gota.centro(st.vista);
    if (x == null) return;
    Gota.ir(x, !animar);
    const nav = $("nav"), ink = st.vista === "equipo" || st.vista === "ia" || st.vista === "ofertas" ? "#fff" : "#1d2100";
    nav.style.setProperty("--bead", COLOR[st.vista]); nav.style.setProperty("--bead-ink", ink);
    $("side").style.setProperty("--bead-ink", ink);
    $("beadIn").innerHTML = ICON[st.vista];
    const si = $("sideInd"), sb = $("side").querySelector(`button[data-v="${st.vista}"]`);
    if (si && sb) { si.style.transform = `translate3d(0,${sb.offsetTop}px,0)`; si.style.background = COLOR[st.vista]; }
  }

  /* Gota con física de resorte: la posición se integra cuadro a cuadro (60/120 fps),
     la gota se estira con la velocidad y el hueco de la barra es una curva que se
     ensancha y se hunde mientras se mueve, como un líquido. */
  const Gota = (() => {
    const RED = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const K = 230, C = 21;            // rigidez y amortiguación del resorte
    let x = 0, v = 0, meta = 0, ult = 0, raf = 0, arr = false, W = 0, H = 64;
    let nav, path, bead, beadIn, glow;
    function dibujar() {
      const vel = Math.min(Math.abs(v), 2600);
      const est = vel / 2600;                                    // 0..1 según velocidad
      // hueco: ancho y profundidad crecen con la velocidad
      const r = 24, ancho = 41 + est * 24, prof = 33 + est * 7, hombro = 12 + est * 7;
      const xa = Math.max(r + 2, Math.min(W - r - 2, x));
      // cerca de los bordes la curva se angosta para no pisar las esquinas redondeadas
      const fi = Math.min(1, (xa - r) / (ancho + hombro)), fd = Math.min(1, (W - r - xa) / (ancho + hombro));
      const L = xa - ancho * fi, R = xa + ancho * fd, hi = hombro * fi, hd = hombro * fd;
      path.setAttribute("d",
        `M${r},0 L${L - hi},0 C${L},0 ${L + 6 * fi},${prof} ${xa},${prof} C${R - 6 * fd},${prof} ${R},0 ${R + hd},0 ` +
        `L${W - r},0 Q${W},0 ${W},${r} L${W},${H - r} Q${W},${H} ${W - r},${H} L${r},${H} Q0,${H} 0,${H - r} L0,${r} Q0,0 ${r},0 Z`);
      // gota: se eleva y se estira en la dirección del movimiento
      const sx = 1 + est * 0.28, sy = 1 - est * 0.16, alto = -est * 10 - (arr ? 6 : 0);
      bead.style.transform = `translate3d(${x - 27}px,${alto}px,0)`;
      beadIn.style.transform = `scale(${sx},${sy}) rotate(${Math.max(-8, Math.min(8, v / 160))}deg)`;
      glow.style.transform = `translate3d(${x - 90}px,0,0)`;
    }
    function paso(t) {
      const dt = Math.min(0.032, (t - (ult || t)) / 1000) || 0.016; ult = t;
      if (!arr) {
        // integración semi-implícita en sub-pasos para que sea estable y suave
        for (let i = 0; i < 4; i++) { const h = dt / 4; v += (K * (meta - x) - C * v) * h; x += v * h; }
      }
      dibujar();
      if (arr || Math.abs(meta - x) > 0.2 || Math.abs(v) > 2) raf = requestAnimationFrame(paso);
      else { x = meta; v = 0; dibujar(); raf = 0; ult = 0; }
    }
    const correr = () => { if (!raf) { ult = 0; raf = requestAnimationFrame(paso); } };
    let centros = {};
    function medir() {
      W = nav.clientWidth; H = nav.clientHeight; $("navSvg").setAttribute("viewBox", `0 0 ${W} ${H}`);
      centros = {}; nav.querySelectorAll("button[data-v]").forEach(b => { centros[b.dataset.v] = b.offsetLeft + b.offsetWidth / 2; });
    }
    function cercano(px) {
      let mejor = null, d = 1e9;
      nav.querySelectorAll("button[data-v]").forEach(b => { const c = b.offsetLeft + b.offsetWidth / 2; if (Math.abs(c - px) < d) { d = Math.abs(c - px); mejor = b; } });
      return mejor;
    }
    function iniciar() {
      nav = $("nav"); path = $("navPath"); bead = $("bead"); beadIn = $("beadIn"); glow = $("navGlow");
      medir();
      let px0 = 0, x0 = 0, vx = 0, tAnt = 0, xAnt = 0;
      bead.onpointerdown = e => {
        arr = true; nav.classList.add("arrastrando"); bead.setPointerCapture(e.pointerId);
        px0 = e.clientX; x0 = x; xAnt = x; tAnt = performance.now(); correr();
      };
      bead.onpointermove = e => {
        if (!arr) return;
        const nx = Math.max(28, Math.min(W - 28, x0 + e.clientX - px0)), t = performance.now();
        vx = (nx - xAnt) / Math.max(0.008, (t - tAnt) / 1000); xAnt = nx; tAnt = t;
        v = v * 0.5 + vx * 0.5; x = nx;
        const b = cercano(x); if (b) nav.style.setProperty("--bead", COLOR[b.dataset.v]);
      };
      const soltar = () => {
        if (!arr) return; arr = false; nav.classList.remove("arrastrando");
        // se proyecta la inercia del gesto para elegir la pestaña
        const b = cercano(x + v * 0.12);
        if (b && b.dataset.v !== st.vista) irA(b.dataset.v); else moverGota(true);
      };
      bead.onpointerup = soltar; bead.onpointercancel = soltar;
    }
    function ir(px, sinAnim) {
      meta = px;
      if (sinAnim || RED || !ult && x === 0) { x = px; v = 0; dibujar(); return; }
      correr();
    }
    return { iniciar, ir, medir: () => { if (nav) { medir(); dibujar(); } }, centro: v => { if (!W) medir(); return centros[v]; } };
  })();
  window.addEventListener("resize", () => { if (st.user) { Gota.medir(); moverGota(false); } });

  /* ============================== DATOS DE LA PERSONA ============================== */
  function personaActual() { return st.user.tipo === "admin" ? st.ver : st.user.persona; }
  function cambioDe(nombre, d) {
    const k = ymd(d), n = norm(nombre);
    return st.cambios.filter(c => c.fecha === k && norm(c.persona) === n && c.estado !== "rechazado").sort((a, b) => b.creado - a.creado)[0] || null;
  }
  // Memoria: el horario de cada persona y día se calcula una sola vez hasta que cambian los datos.
  const memoEstado = new Map();
  const olvidar = () => memoEstado.clear();
  function estado(nombre, d) {
    const k = nombre + "|" + ymd(d);
    if (memoEstado.has(k)) return memoEstado.get(k);
    const r = estadoCalc(nombre, d); memoEstado.set(k, r); return r;
  }
  function estadoCalc(nombre, d) {
    const u = L.ubicar(nombre); if (!u) return null;
    const c = cambioDe(nombre, d);
    const r = L.estadoDia(L.datos().SECTORES[u.si], u.pi, d, c ? { manual: { t: !!c.t, h: c.h } } : {});
    if (c) r.cambio = c;
    return r;
  }

  /* ============================== RENDER ============================== */
  function render() {
    if (!st.user) return;
    const esAdmin = st.user.tipo === "admin";
    document.querySelectorAll("[data-v]").forEach(b => b.classList.toggle("on", b.dataset.v === st.vista));
    ["inicio", "calendario", "equipo", "admin", "ia", "ofertas"].forEach(v => $("v-" + v).classList.toggle("oculto", v !== st.vista));
    // transición entre pestañas: entra desde el lado hacia donde se movió, con desenfoque
    const cambio = st.vistaAnt !== st.vista;
    if (cambio) {
      const dir = st.vistaAnt ? Math.sign(navItems.indexOf(st.vista) - navItems.indexOf(st.vistaAnt)) : 0;
      const el = $("v-" + st.vista);
      el.style.setProperty("--dir", dir);
      el.classList.remove("entra"); void el.offsetWidth; el.classList.add("entra");
      moverGota(!!st.vistaAnt);
      st.vistaAnt = st.vista;
    }
    const nombre = personaActual();
    $("avatar").innerHTML = esAdmin ? '<img class="logo-img" src="img/logo.svg" alt="">' : esc(iniciales(nombre));
    $("saludo").textContent = saludoHora().slice(1) + (esAdmin ? " · Administrador" : "");
    $("quien").textContent = esAdmin ? (nombreAdmin() || st.user.usuario) : nombre;

    // selector "ver como" (solo administradores)
    $("verComo").classList.toggle("oculto", !esAdmin || st.vista === "admin" || st.vista === "ia" || st.vista === "ofertas");
    if (esAdmin) {
      const ps = L.personas();
      $("selVer").innerHTML = ps.map(p => `<option ${p.n === st.ver ? "selected" : ""}>${esc(p.n)}</option>`).join("");
      $("selVer").onchange = () => { st.ver = $("selVer").value; render(); };
    }
    const ok = !!(nombre && L.ubicar(nombre));
    $("sinPersona").classList.toggle("oculto", ok || st.vista === "admin" || st.vista === "ia" || st.vista === "ofertas");
    if (!ok) $("sinPersona").innerHTML = `<h3>Tu nombre no está en la planilla</h3><p class="muted">Tu cuenta está asociada a <b>${esc(nombre)}</b>, que no aparece en la planilla actual. Pedile a un administrador que te asigne a la persona correcta.</p>`;
    if (st.vista === "inicio") ok ? renderInicio(nombre) : ($("v-inicio").innerHTML = "");
    if (st.vista === "calendario") ok ? renderCalendario(nombre) : ($("v-calendario").innerHTML = "");
    if (st.vista === "equipo") renderEquipo(ok ? nombre : null);
    if (st.vista === "admin" && esAdmin) renderAdmin();
    if (st.vista === "ia" && esAdmin) renderIA();
    if (st.vista === "ofertas") Ofertas.render($("v-ofertas"));
  }

  function selectorFecha(id) {
    return `<div class="daynav"><button class="iconbtn" data-dn="-1" aria-label="Día anterior">‹</button>
      <input type="date" class="in" id="${id}" value="${ymd(st.fecha)}">
      <button class="iconbtn" data-dn="1" aria-label="Día siguiente">›</button>
      <button class="btn sm" data-dn="0">Hoy</button></div>`;
  }
  function enlazarFecha(root, id) {
    root.querySelectorAll("[data-dn]").forEach(b => b.onclick = () => {
      const n = +b.dataset.dn; st.fecha = n === 0 ? hoy() : addDays(st.fecha, n);
      st.mes = new Date(st.fecha.getFullYear(), st.fecha.getMonth(), 1); render();
    });
    const inp = $(id); if (inp) inp.onchange = () => { if (inp.value) { st.fecha = parseYMD(inp.value); st.mes = new Date(st.fecha.getFullYear(), st.fecha.getMonth(), 1); render(); } };
  }

  function bloqueDia(nombre, d, hero) {
    const s = estado(nombre, d);
    const lun = lunesDe(d), esHoy = ymd(d) === ymd(hoy());
    let pills = "";
    if (s.feriado) pills += `<span class="pill fer">${esc(s.feriado.nombre)}</span>`;
    if (s.tipo === "finde") pills += `<span class="pill">Finde · Grupo ${s.grupo}</span>`;
    if (s.tipo === "feriado") pills += `<span class="pill">${s.trabaja ? "Feriado que trabajás" : "Feriado que descansás"}</span>`;
    if (s.tipo === "semana" && !s.manual) pills += `<span class="pill">Semana ${corto(lun)} – ${corto(addDays(lun, 4))}</span>`;
    if (s.fijo) pills += `<span class="pill">Horario fijo</span>`;
    if (s.cambio) pills += s.cambio.estado === "pendiente"
      ? `<span class="pill pend">⏳ Cambio pendiente de aprobación</span>`
      : `<span class="pill ok">✓ Cambio aceptado</span>`;
    const notas = [];
    if (s.cambio && s.cambio.nota) notas.push("📝 " + esc(s.cambio.nota));
    if (s.trabaja && s.h === "Horario a confirmar") notas.push(s.tipo === "finde"
      ? `Trabajás con el Grupo ${s.grupo}, pero no figurás en su planilla: confirmá el horario.`
      : "Te toca trabajar este feriado (uno sí, uno no). No figurás en la planilla del feriado: confirmá el horario.");
    if (s.feriado && s.feriado.tipo === "puente" && !s.manual) notas.push("Día no laborable (puente turístico): se trabaja normal y no cuenta en el “uno sí, uno no”.");
    if (s.tipo === "finde" && s.trabaja && L.datos().FINDE[s.grupo].obs) notas.push("Obs.: " + esc(L.datos().FINDE[s.grupo].obs));
    const min = s.trabaja ? L.minutos(s.h) : null;
    return `<div class="card ${hero ? "hero" : ""}">
      <div class="lbl">${esHoy ? "Hoy · " : ""}${fechaLarga(d)}</div>
      <div class="big ${s.trabaja ? "" : "franco"}">${esc(s.h)}</div>
      ${min ? `<div class="lbl">${L.fmtHoras(min)} de trabajo</div>` : ""}
      <div class="pills">${pills}</div>
      ${notas.map(n => `<div class="nota">${n}</div>`).join("")}
    </div>`;
  }

  function proximos(nombre, desde, cant, pred) {
    const r = []; let x = desde;
    for (let i = 0; i < 400 && r.length < cant; i++, x = addDays(x, 1)) { if (pred(x)) r.push(x); }
    return r;
  }

  function renderInicio(nombre) {
    const d = st.fecha, lun = lunesDe(d);
    // horas de la semana (lunes a domingo)
    let min = 0, dias = 0, sinH = 0;
    for (let i = 0; i < 7; i++) { const s = estado(nombre, addDays(lun, i)); if (s.trabaja) { dias++; const m = L.minutos(s.h); if (m === null) sinH++; else min += m; } }
    const franco = proximos(nombre, addDays(hoy(), 1), 1, x => !estado(nombre, x).trabaja)[0];
    const finde = proximos(nombre, hoy(), 1, x => x.getDay() === 6)[0];
    const fs = finde && estado(nombre, finde), fd = finde && estado(nombre, addDays(finde, 1));
    const fer = proximos(nombre, hoy(), 1, x => { const f = L.feriado(x); return f && f.tipo === "feriado"; })[0];
    const fe = fer && estado(nombre, fer);
    const avisos = st.avisos.slice(0, 5);

    $("v-inicio").innerHTML = `<div class="grid g-home">
      <div class="grid">
        ${bloqueDia(nombre, d, true)}
        <div class="card">${selectorFecha("fInicio")}</div>
        <div class="stats">
          <div class="stat"><div class="k">Horas de la semana</div><div class="v">${L.fmtHoras(min)}</div><div class="s">${dias} ${dias === 1 ? "día" : "días"}${sinH ? ` (${sinH} sin horario)` : ""} · ${corto(lun)}–${corto(addDays(lun, 6))}</div><div class="bar"><i style="width:${Math.min(100, min / 60 / 48 * 100)}%"></i></div></div>
          <div class="stat"><div class="k">Próximo franco</div><div class="v">${franco ? corto(franco) : "—"}</div><div class="s">${franco ? DIAS[franco.getDay()] : ""}</div></div>
          <div class="stat"><div class="k">Próximo finde</div><div class="v">${fs && (fs.trabaja || fd.trabaja) ? "Trabajás" : "Libre"}</div><div class="s">${finde ? corto(finde) + " – " + corto(addDays(finde, 1)) + " · Grupo " + fs.grupo : ""}</div></div>
          <div class="stat"><div class="k">Próximo feriado</div><div class="v">${fe ? (fe.trabaja ? "Trabajás" : "Descansás") : "—"}</div><div class="s">${fer ? DIAS[fer.getDay()] + " " + corto(fer) : ""}</div></div>
        </div>
      </div>
      <div class="grid">
        <div class="card"><h3>📢 Avisos</h3><div class="list">${avisos.length ? avisos.map(a => `<div class="it"><span class="dot"></span><div class="grow">${esc(a.texto)}<div class="muted">${esc(a.por || "")} · ${new Date(a.creado).toLocaleDateString("es-AR")}</div></div></div>`).join("") : `<div class="empty">No hay avisos.</div>`}</div></div>
        <div class="card"><h3>Próximos findes y feriados</h3><table>${filasEventos(nombre)}</table></div>
        <div class="card"><h3>Próximas semanas <span class="muted">(lunes a viernes)</span></h3><table>${filasSemanas(nombre)}</table></div>
        ${MARCA}
      </div>
    </div>`;
    enlazarFecha($("v-inicio"), "fInicio");
    $("v-inicio").querySelectorAll("tr[data-d]").forEach(tr => tr.onclick = () => { st.fecha = parseYMD(tr.dataset.d); st.mes = new Date(st.fecha.getFullYear(), st.fecha.getMonth(), 1); render(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  }

  function filasEventos(nombre) {
    const ev = []; let x = hoy();
    for (let k = 0; k < 200 && ev.length < 8; k++, x = addDays(x, 1)) {
      if (x.getDay() === 6) ev.push([x, "finde"]);
      else if (k === 0 && x.getDay() === 0) ev.push([x, "dom"]);
      else if (L.feriado(x) && !L.finde(x)) ev.push([x, "fer"]);
    }
    return ev.map(([x, t]) => {
      if (t === "finde") {
        const y = addDays(x, 1), a = estado(nombre, x), b = estado(nombre, y);
        const fer = [L.feriado(x), L.feriado(y)].filter(Boolean).map(f => " · " + esc(f.nombre)).join("");
        const txt = (!a.trabaja && !b.trabaja) ? "Franco" : `Sáb ${a.trabaja ? esc(corta(a.h)) : "franco"}<br>Dom ${b.trabaja ? esc(corta(b.h)) : "franco"}`;
        return `<tr class="link ${a.trabaja || b.trabaja ? "me" : ""}" data-d="${ymd(x)}"><td>Finde ${corto(x)} – ${corto(y)}<div class="muted">Grupo ${a.grupo}${fer}</div></td><td class="h">${txt}</td></tr>`;
      }
      const s = estado(nombre, x);
      const det = s.feriado ? esc(s.feriado.nombre) + (s.feriado.tipo === "puente" ? " · día normal" : "") : "Grupo " + s.grupo;
      return `<tr class="link ${s.trabaja && s.tipo !== "semana" ? "me" : ""}" data-d="${ymd(x)}"><td>${DIAS[x.getDay()]} ${corto(x)}<div class="muted">${det}</div></td><td class="h">${s.trabaja ? esc(corta(s.h)) : "Franco"}</td></tr>`;
    }).join("");
  }
  function filasSemanas(nombre) {
    const u = L.ubicar(nombre), sec = L.datos().SECTORES[u.si], lun0 = lunesDe(hoy());
    let r = "";
    for (let j = 0; j < 8; j++) {
      const l = addDays(lun0, 7 * j);
      r += `<tr class="${j === 0 ? "me" : ""}"><td>${corto(l)} – ${corto(addDays(l, 4))}</td><td class="h">${esc(L.horariosSector(sec, L.semanaK(l))[u.pi].actual)}</td></tr>`;
    }
    return r;
  }

  function renderCalendario(nombre) {
    const m = st.mes, hoyK = ymd(hoy());
    let cal = ["L", "M", "M", "J", "V", "S", "D"].map(x => `<div class="dn">${x}</div>`).join("");
    for (let k = 0; k < (m.getDay() + 6) % 7; k++) cal += `<div class="d vacio"></div>`;
    let trab = 0, findes = 0, min = 0;
    for (let d = new Date(m); d.getMonth() === m.getMonth(); d = addDays(d, 1)) {
      const s = estado(nombre, d);
      if (s.trabaja) { trab++; min += L.minutos(s.h) || 0; if (s.tipo !== "semana") findes++; }
      let c = "d";
      if (s.trabaja) c += s.tipo === "semana" ? " w" : " fw";
      if (s.feriado) c += " fer";
      if (s.cambio) c += " cam";
      if (ymd(d) === hoyK) c += " hoy";
      if (ymd(d) === ymd(st.fecha)) c += " sel";
      cal += `<div class="${c}" data-d="${ymd(d)}"><div class="n">${d.getDate()}</div><div class="t">${esc(corta(s.h))}</div></div>`;
    }
    $("v-calendario").innerHTML = `<div class="grid g-cal">
      <div class="card">
        <div class="calhead"><button class="iconbtn" id="mPrev" aria-label="Mes anterior">‹</button><h3>${MESES_L[m.getMonth()]} ${m.getFullYear()}</h3><button class="iconbtn" id="mNext" aria-label="Mes siguiente">›</button></div>
        <div class="cal" id="cal">${cal}</div>
        <div class="leyenda"><span><i style="background:var(--work)"></i>Semana</span><span><i style="background:var(--dark2)"></i>Finde / feriado</span><span><i style="background:var(--off)"></i>Franco</span><span><i style="background:var(--warn)"></i>Feriado</span><span><i style="background:var(--bad);border-radius:50%"></i>Cambio cargado</span></div>
      </div>
      <div class="grid">
        ${bloqueDia(nombre, st.fecha, true)}
        <div class="stats" style="grid-template-columns:repeat(3,1fr)">
          <div class="stat"><div class="k">Días</div><div class="v">${trab}</div><div class="s">en ${MESES_L[m.getMonth()].toLowerCase()}</div></div>
          <div class="stat"><div class="k">Findes/feriados</div><div class="v">${findes}</div></div>
          <div class="stat"><div class="k">Horas</div><div class="v">${Math.round(min / 60)}</div></div>
        </div>
        <div class="card"><h3>Feriados ${st.fecha.getFullYear()}</h3><table>${filasFeriados(nombre, st.fecha.getFullYear())}</table></div>
      </div>
    </div>`;
    $("mPrev").onclick = () => { st.mes = new Date(m.getFullYear(), m.getMonth() - 1, 1); render(); };
    $("mNext").onclick = () => { st.mes = new Date(m.getFullYear(), m.getMonth() + 1, 1); render(); };
    $("cal").onclick = e => { const el = e.target.closest("[data-d]"); if (el) { st.fecha = parseYMD(el.dataset.d); render(); } };
    $("v-calendario").querySelectorAll("tr[data-d]").forEach(tr => tr.onclick = () => { st.fecha = parseYMD(tr.dataset.d); st.mes = new Date(st.fecha.getFullYear(), st.fecha.getMonth(), 1); render(); });
  }
  function filasFeriados(nombre, y) {
    const fs = L.feriadosAnio(y);
    const sinP = !(L.datos().PUENTES || {})[y];
    return Object.keys(fs).sort().map(k => {
      const x = parseYMD(k), f = fs[k], s = estado(nombre, x);
      const que = f.tipo === "puente" ? "Día normal" : L.finde(x) ? (s.trabaja ? "Trabajás (finde)" : "Franco (finde)") : (s.trabaja ? "Trabajás" : "Descansás");
      return `<tr class="link ${s.trabaja && f.tipo === "feriado" ? "me" : ""}" data-d="${k}"><td>${DIAS[x.getDay()].slice(0, 3)} ${corto(x)}<div class="muted">${esc(f.nombre)}</div></td><td class="h">${que}</td></tr>`;
    }).join("") + (sinP ? `<tr><td colspan="2" class="muted">Los puentes turísticos de ${y} todavía no están cargados.</td></tr>` : "");
  }

  function tablaLista(lista, nombre) {
    let last = "", html = "";
    (lista || []).forEach(r => {
      if (r.sector !== last) { html += `<tr><td class="sec" colspan="2">${esc(r.sector)}</td></tr>`; last = r.sector; }
      html += `<tr class="${nombre && norm(r.n) === norm(nombre) ? "me" : ""}"><td>${esc(r.n)}${r.fijo ? '<span class="tag">fijo</span>' : ""}</td><td class="h">${esc(r.h)}</td></tr>`;
    });
    return html || `<tr><td class="empty">Sin planilla.</td></tr>`;
  }
  function renderEquipo(nombre) {
    const d = st.fecha, D = L.datos();
    let titulo, nota, html;
    if (L.finde(d)) {
      const f = L.listaFinde(d);
      titulo = `Grupo ${f.grupo} · ${fechaLarga(d)}`;
      nota = f.k === 0 ? `Planilla original del Grupo ${f.grupo} (${esc(D.FINDE[f.grupo].ref || D.FINDE[f.grupo].base)}).`
        : `Calculado a partir de la planilla del ${esc(D.FINDE[f.grupo].ref || D.FINDE[f.grupo].base)}, rotada ${Math.abs(f.k)} ${Math.abs(f.k) === 1 ? "vez" : "veces"}${f.k < 0 ? " hacia atrás" : ""}. Los marcados como fijo no rotan.`;
      html = tablaLista(f.lista, nombre);
    } else if (L.feriadoAlterna(d)) {
      const lista = L.listaFeriado(d), k = L.feriadoK(d);
      titulo = `Feriado · ${fechaLarga(d)}`;
      nota = !lista ? `En este feriado trabajan los que descansaron el ${esc(D.FERIADO_PLANILLA.B.ref)}. Todavía no hay planilla de ese equipo.`
        : k === 0 ? `Planilla del feriado del ${esc(D.FERIADO_PLANILLA.B.ref)}.` : `Equipo del ${esc(D.FERIADO_PLANILLA.B.ref)} con los horarios rotados ${k / 2} ${k / 2 === 1 ? "vez" : "veces"}.`;
      html = tablaLista(lista, nombre);
    } else {
      titulo = `Semana del ${corto(lunesDe(d))} al ${corto(addDays(lunesDe(d), 4))}`;
      nota = "Los marcados como fijo (en negrita en la planilla) mantienen su horario y no rotan.";
      const k = L.semanaK(d), rows = [];
      D.SECTORES.forEach(s => L.horariosSector(s, k).forEach(p => { if (!/^Sin horario/.test(p.h)) rows.push({ sector: s.nombre, n: p.n, h: p.actual, fijo: p.fijo }); }));
      html = tablaLista(rows, nombre);
    }
    $("v-equipo").innerHTML = `<div class="grid"><div class="card">${selectorFecha("fEquipo")}</div>
      <div class="card"><h3>${titulo}</h3><table>${html}</table><p class="muted">${nota}</p></div></div>`;
    enlazarFecha($("v-equipo"), "fEquipo");
  }

  const MARCA = `<div class="card marca-card"><img class="lg" src="img/logo.svg" alt="">
    <img class="wm claro" src="img/la-esquina.png" alt="La Esquina"><img class="wm osc" src="img/la-esquina-blanco.png" alt="La Esquina">
    <span class="sep"></span>
    <img class="wm claro" src="img/belgrano.png" alt="Belgrano"><img class="wm osc" src="img/belgrano-blanco.png" alt="Belgrano"></div>`;

  /* ============================== ADMINISTRACIÓN ============================== */
  function renderAdmin() {
    const tabs = { empleados: "Empleados", cambios: "Cambios y francos", avisos: "Avisos", planillas: "Planillas", personas: "Grupos y feriados", ia: "Inteligencia artificial" };
    $("v-admin").innerHTML = `<div class="grid">
      <div class="seg" id="segAdm">${Object.entries(tabs).map(([k, v]) => `<button data-t="${k}" class="${st.adminTab === k ? "on" : ""}">${v}</button>`).join("")}</div>
      <div id="admBody" class="grid"></div></div>`;
    $("segAdm").querySelectorAll("button").forEach(b => b.onclick = () => { st.adminTab = b.dataset.t; render(); });
    ({ empleados: admEmpleados, cambios: admCambios, avisos: admAvisos, planillas: admPlanillas, personas: admPersonas, ia: admIA })[st.adminTab]($("admBody"));
  }

  function opcionesPersonas(sel) { return L.personas().map(p => `<option ${p.n === sel ? "selected" : ""}>${esc(p.n)}</option>`).join(""); }

  function admEmpleados(root) {
    const total = L.personas().length, reg = st.empleados.length;
    const registrados = new Set(st.empleados.map(e => norm(e.persona)));
    const faltan = L.personas().filter(p => !registrados.has(norm(p.n)));
    root.innerHTML = `
      <div class="stats">
        <div class="stat"><div class="k">Registrados</div><div class="v">${reg}</div><div class="bar"><i style="width:${total ? reg / total * 100 : 0}%"></i></div></div>
        <div class="stat"><div class="k">Personas en planilla</div><div class="v">${total}</div><div class="s">${faltan.length} sin registrarse</div></div>
      </div>
      <div class="card"><h3>Empleados registrados</h3>
        <input class="in" id="busEmp" placeholder="Buscar por nombre o DNI" style="margin-bottom:8px">
        <div class="list" id="lstEmp"></div>
      </div>
      <div class="card"><h3>Todavía sin registrarse</h3><div class="muted">${faltan.map(p => esc(p.n)).join(" · ") || "Todos registrados 🎉"}</div></div>
      <p class="muted">${B.online ? "Datos compartidos en línea." : "Modo local: solo se ven los registros hechos en este dispositivo. Configurá Firebase para compartirlos (ver GUIA_FIREBASE.md)."}</p>`;
    const pintar = () => {
      const q = norm($("busEmp").value || "");
      const l = st.empleados.filter(e => !q || norm(e.persona || "").includes(q) || String(e.dni).includes(q));
      $("lstEmp").innerHTML = l.length ? l.map(e => {
        const u = L.ubicar(e.persona);
        return `<div class="it" data-id="${esc(e.id)}"><div class="avatar" style="width:36px;height:36px;font-size:13px">${esc(iniciales(e.persona))}</div>
          <div class="grow"><b>${esc(e.persona)}</b>${u ? "" : ' <span class="pill bad">no está en la planilla</span>'}
            <div class="muted">DNI ${esc(e.dni)} · ${u ? esc(u.sector) : "—"} · desde ${new Date(e.creado).toLocaleDateString("es-AR")}</div>
            <div class="row" style="margin-top:6px"><button class="btn sm" data-a="ver">Ver horario</button><button class="btn sm" data-a="mover">Cambiar persona</button><button class="btn sm bad" data-a="borrar">Borrar</button></div>
            <div class="row oculto" data-mover style="margin-top:6px"><select class="in f">${opcionesPersonas(e.persona)}</select><button class="btn sm pri" data-a="okmover">Guardar</button></div>
          </div></div>`;
      }).join("") : `<div class="empty">Nadie registrado${q ? " con esa búsqueda" : " todavía"}.</div>`;
      $("lstEmp").querySelectorAll(".it").forEach(it => {
        const e = st.empleados.find(x => x.id === it.dataset.id);
        it.querySelectorAll("[data-a]").forEach(b => b.onclick = async () => {
          const a = b.dataset.a;
          if (a === "ver") { st.ver = e.persona; st.vista = "inicio"; render(); window.scrollTo(0, 0); }
          if (a === "mover") it.querySelector("[data-mover]").classList.toggle("oculto");
          if (a === "okmover") { try { await B.reasignarEmpleado(e.id, it.querySelector("[data-mover] select").value); toast("Persona actualizada"); } catch (er) { toast(er.message); } }
          if (a === "borrar" && confirm(`¿Borrar la cuenta de ${e.persona} (DNI ${e.dni})? Va a tener que registrarse de nuevo.`)) { try { await B.borrarEmpleado(e.id); toast("Cuenta borrada"); } catch (er) { toast(er.message); } }
        });
      });
    };
    $("busEmp").oninput = pintar; pintar();
  }

  function admCambios(root) {
    const desde = ymd(addDays(hoy(), -30));
    const lista = st.cambios.filter(c => c.fecha >= desde).sort((a, b) => a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : b.creado - a.creado);
    // borrador del formulario: se conserva aunque lleguen datos nuevos y se vuelva a dibujar
    const bd = st.cb = st.cb || { per: st.ver, fec: ymd(st.fecha), hasta: "", tipo: 1, hora: "", nota: "" };
    root.innerHTML = `<div class="card"><h3>Cargar cambio o franco</h3>
        <div class="field"><label>Persona</label><select class="in" id="cbPer">${opcionesPersonas(bd.per)}</select></div>
        <div class="row"><div class="field f"><label>Desde</label><input type="date" class="in" id="cbFec" value="${esc(bd.fec)}"></div>
          <div class="field f"><label>Hasta (opcional)</label><input type="date" class="in" id="cbHasta" value="${esc(bd.hasta)}"></div></div>
        <div class="field"><label>Ese día</label><div class="seg" id="cbTipo"><button class="${bd.tipo ? "on" : ""}" data-t="1">Trabaja</button><button class="${bd.tipo ? "" : "on"}" data-t="0">Franco</button></div></div>
        <div class="field ${bd.tipo ? "" : "oculto"}" id="cbHoraF"><label>Horario</label><input class="in" id="cbHora" value="${esc(bd.hora)}" placeholder="Ej: 8 a 16  ·  o  9 a 13 · 18 a 22"></div>
        <div class="field"><label>Nota (la ve el empleado)</label><input class="in" id="cbNota" value="${esc(bd.nota)}" placeholder="Ej: cubre a Rojas"></div>
        <p class="muted" style="margin:0 0 8px">Al guardar, el empleado recibe una notificación y tiene que aprobar el cambio.</p>
        <div class="muted" id="cbPrev" style="margin-bottom:8px"></div>
        <button class="btn pri" id="cbOk">Guardar cambio</button>
      </div>
      <div class="card"><h3>Cambios cargados <span class="sp"></span><span class="muted">últimos 30 días y futuros</span></h3><div class="list">${lista.length ? lista.map(c => `
        <div class="it"><span class="dot" style="background:${c.t ? "var(--acc)" : "var(--bad)"}"></span><div class="grow"><b>${esc(c.persona)}</b> · ${DIAS[parseYMD(c.fecha).getDay()]} ${corto(parseYMD(c.fecha))}
          <div class="muted">${c.t ? "Trabaja " + esc(c.h || "") : "Franco"}${c.nota ? " · " + esc(c.nota) : ""} · por ${esc(c.por || "")}</div>
          <div style="margin-top:4px">${chipEstado(c)}${c.respuesta ? ` <span class="muted">“${esc(c.respuesta)}”</span>` : ""}</div></div>
          <button class="btn sm bad" data-del="${esc(c.id)}">Quitar</button></div>`).join("") : `<div class="empty">No hay cambios cargados.</div>`}</div></div>`;
    let tipo = bd.tipo;
    const sync = () => Object.assign(bd, { per: $("cbPer").value, fec: $("cbFec").value, hasta: $("cbHasta").value, tipo, hora: $("cbHora").value, nota: $("cbNota").value });
    ["cbPer", "cbFec", "cbHasta", "cbHora", "cbNota"].forEach(id => $(id).addEventListener("input", sync));
    const prev = () => {
      const p = $("cbPer").value, d = $("cbFec").value ? parseYMD($("cbFec").value) : null;
      if (!d) return $("cbPrev").textContent = "";
      const s = estado(p, d);
      $("cbPrev").textContent = s ? `Según la planilla, el ${corto(d)} ${p} tiene: ${s.h}${s.cambio ? " (ya tiene un cambio cargado)" : ""}.` : "";
      if (tipo && !$("cbHora").value && s && s.trabaja && s.h !== "Horario a confirmar") $("cbHora").placeholder = "Ej: " + s.h;
    };
    $("cbTipo").querySelectorAll("button").forEach(b => b.onclick = () => { tipo = +b.dataset.t; sync(); $("cbTipo").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); $("cbHoraF").classList.toggle("oculto", !tipo); });
    $("cbPer").onchange = () => { sync(); prev(); }; $("cbFec").onchange = () => { sync(); prev(); }; prev();
    $("cbOk").onclick = async () => {
      const persona = $("cbPer").value, f1 = $("cbFec").value, f2 = $("cbHasta").value || f1;
      if (!f1) return toast("Elegí la fecha");
      if (f2 < f1) return toast("La fecha 'hasta' es anterior a 'desde'");
      const h = $("cbHora").value.trim();
      if (tipo && h && L.minutos(h) === null) return toast("Escribí el horario como '8 a 16' o '9 a 13 · 18 a 22'");
      const dias = []; for (let x = parseYMD(f1); ymd(x) <= f2 && dias.length < 62; x = addDays(x, 1)) dias.push(ymd(x));
      try {
        const lote = "L" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const nota = $("cbNota").value.trim();
        await B.guardarCambios(dias.map(fecha => ({ persona, fecha, t: !!tipo, h: tipo ? h : "", nota, por: st.user.usuario, estado: "pendiente", lote })));
        st.cb = { per: persona, fec: f1, hasta: "", tipo: 1, hora: "", nota: "" };
        toast(dias.length > 1 ? `Guardado para ${dias.length} días` : "Cambio guardado");
      } catch (er) { toast(er.message); }
    };
    root.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => { try { await B.borrarCambio(b.dataset.del); toast("Cambio quitado"); } catch (er) { toast(er.message); } });
  }

  function admAvisos(root) {
    root.innerHTML = `<div class="card"><h3>Nuevo aviso para todos</h3>
        <textarea class="in" id="avTxt" maxlength="500" placeholder="Ej: Juan Renzo atenta por si se necesita refuerzo en caja."></textarea>
        <div class="row" style="margin-top:8px"><button class="btn pri" id="avOk">Publicar</button></div></div>
      <div class="card"><h3>Avisos publicados</h3><div class="list">${st.avisos.length ? st.avisos.map(a => `<div class="it"><span class="dot"></span><div class="grow">${esc(a.texto)}<div class="muted">${esc(a.por || "")} · ${new Date(a.creado).toLocaleString("es-AR")}</div></div><button class="btn sm bad" data-del="${esc(a.id)}">Borrar</button></div>`).join("") : `<div class="empty">No hay avisos.</div>`}</div></div>`;
    $("avOk").onclick = async () => { const t = $("avTxt").value.trim(); if (!t) return; try { await B.publicarAviso(t, st.user.usuario); toast("Aviso publicado"); } catch (er) { toast(er.message); } };
    root.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => { if (confirm("¿Borrar este aviso?")) { try { await B.borrarAviso(b.dataset.del); } catch (er) { toast(er.message); } } });
  }

  /* ---------- editor de planillas ---------- */
  const PLANES = {
    semana: "Semana (lunes a viernes)", A_sab: "Grupo A · sábado", A_dom: "Grupo A · domingo",
    B_sab: "Grupo B · sábado", B_dom: "Grupo B · domingo", feriado: "Feriado",
  };
  function cargarPlan(plan) {
    const D = L.datos();
    let rows;
    if (plan === "semana") { rows = []; D.SECTORES.forEach(s => s.personas.forEach(p => rows.push({ sector: s.nombre, n: p.n, h: p.h, fijo: !!p.fijo }))); }
    else if (plan === "feriado") rows = D.FERIADO_PLANILLA.B.lista.map(r => ({ sector: r[0], n: r[1], h: r[2], fijo: !!r[3] }));
    else { const [g, dia] = plan.split("_"); rows = D.FINDE[g][dia].map(r => ({ sector: r[0], n: r[1], h: r[2], fijo: !!r[3] })); }
    const g = plan.split("_")[0];
    st.ed = {
      plan, rows, cambiado: false,
      fecha: plan === "semana" ? D.BASE_LUNES : plan === "feriado" ? D.FERIADO_BASE : ymd(L.baseGrupo(g)),
      obs: plan.includes("_") ? (D.FINDE[g].obs || "") : "",
    };
  }
  function sectoresDe(rows) { const o = []; rows.forEach(r => { if (!o.includes(r.sector)) o.push(r.sector); }); return o; }

  function admPlanillas(root) {
    if (!st.ed) cargarPlan("semana");
    const e = st.ed, D = L.datos();
    const esFinde = e.plan.includes("_"), g = e.plan.split("_")[0];
    const lblFecha = e.plan === "semana" ? "Lunes de la semana de esta planilla" : e.plan === "feriado" ? "Fecha del feriado de esta planilla" : `Sábado del finde de esta planilla (vale para sábado y domingo del Grupo ${g})`;
    root.innerHTML = `<div class="card">
        <div class="field"><label>Planilla</label><select class="in" id="edPlan">${Object.entries(PLANES).map(([k, v]) => `<option value="${k}" ${k === e.plan ? "selected" : ""}>${v}</option>`).join("")}</select></div>
        <div class="field"><label>${lblFecha}</label><input type="date" class="in" id="edFecha" value="${esc(e.fecha)}"></div>
        ${esFinde ? `<div class="field"><label>Observaciones del Grupo ${g}</label><input class="in" id="edObs" value="${esc(e.obs)}"></div>` : ""}
        <p class="muted" style="margin:0">Cargá la planilla tal como sale el día de la fecha de arriba, en el mismo orden. La app hace bajar un puesto a cada uno por ${e.plan === "semana" ? "semana" : esFinde ? "cada finde que trabaja el grupo" : "cada feriado que trabaja el equipo"}. Tocá <b>N</b> para marcar a alguien en negrita (horario fijo, no rota).</p>
      </div>
      <div id="edSecs"></div>
      <div class="card"><div class="row"><button class="btn" id="edAddSec">+ Sector</button><span class="f"></span>
        <button class="btn" id="edReset">Descartar</button><button class="btn pri" id="edSave">Guardar planilla</button></div>
        <div class="muted" id="edMsg" style="margin-top:8px"></div>
        <details style="margin-top:10px"><summary class="muted">Restaurar planillas originales</summary><p class="muted">Vuelve todas las planillas, grupos y feriados a los de noviembre 2026 que trae la app.</p><button class="btn bad" id="edSeed">Restaurar todo</button></details>
      </div>`;
    const pintar = () => {
      const secs = sectoresDe(e.rows);
      $("edSecs").innerHTML = secs.map((s, si) => `<div class="ed-sec" data-sec="${esc(s)}">
          <div class="hd"><input class="in" data-secname value="${esc(s)}" style="font-weight:700">
            <button class="mini" data-sa="up" title="Subir sector">↑</button><button class="mini" data-sa="down" title="Bajar sector">↓</button></div>
          ${e.rows.map((r, i) => r.sector !== s ? "" : `<div class="ed-row" data-i="${i}">
            <input class="in" data-k="n" value="${esc(r.n)}" placeholder="Apellido Nombre">
            <input class="in hcol" data-k="h" value="${esc(r.h)}" placeholder="7 a 15 · 18 a 22">
            <div class="acts"><button class="mini ${r.fijo ? "on" : ""}" data-a="fijo" title="Negrita: horario fijo">N</button>
              <button class="mini" data-a="up" title="Subir">↑</button><button class="mini" data-a="down" title="Bajar">↓</button><button class="mini" data-a="del" title="Quitar">✕</button></div>
          </div>`).join("")}
          <button class="btn sm" data-sa="add">+ Persona</button></div>`).join("");
      $("edSecs").querySelectorAll(".ed-row").forEach(row => {
        const i = +row.dataset.i;
        row.querySelectorAll("input[data-k]").forEach(inp => inp.oninput = () => { e.rows[i][inp.dataset.k] = inp.value; e.cambiado = true; });
        row.querySelectorAll("[data-a]").forEach(b => b.onclick = () => {
          const a = b.dataset.a, r = e.rows;
          const mismos = r.map((x, k) => k).filter(k => r[k].sector === r[i].sector), pos = mismos.indexOf(i);
          if (a === "fijo") r[i].fijo = !r[i].fijo;
          if (a === "del") { if (!confirm(`¿Quitar a ${r[i].n || "esta fila"}?`)) return; r.splice(i, 1); }
          if (a === "up" && pos > 0) { const j = mismos[pos - 1];[r[i], r[j]] = [r[j], r[i]]; }
          if (a === "down" && pos < mismos.length - 1) { const j = mismos[pos + 1];[r[i], r[j]] = [r[j], r[i]]; }
          e.cambiado = true; pintar();
        });
      });
      $("edSecs").querySelectorAll(".ed-sec").forEach(box => {
        const s = box.dataset.sec;
        box.querySelector("[data-secname]").onchange = ev => { const nv = ev.target.value.trim() || s; e.rows.forEach(r => { if (r.sector === s) r.sector = nv; }); e.cambiado = true; pintar(); };
        box.querySelectorAll("[data-sa]").forEach(b => b.onclick = () => {
          const a = b.dataset.sa;
          if (a === "add") { let last = -1; e.rows.forEach((r, k) => { if (r.sector === s) last = k; }); e.rows.splice(last + 1, 0, { sector: s, n: "", h: "", fijo: false }); }
          else {
            const orden = sectoresDe(e.rows), k = orden.indexOf(s), j = a === "up" ? k - 1 : k + 1;
            if (j < 0 || j >= orden.length) return;
            [orden[k], orden[j]] = [orden[j], orden[k]];
            e.rows = orden.flatMap(x => e.rows.filter(r => r.sector === x));
          }
          e.cambiado = true; pintar();
        });
      });
    };
    pintar();
    $("edPlan").onchange = () => { if (e.cambiado && !confirm("Hay cambios sin guardar. ¿Descartarlos?")) { $("edPlan").value = e.plan; return; } cargarPlan($("edPlan").value); render(); };
    $("edFecha").onchange = () => { e.fecha = $("edFecha").value; e.cambiado = true; };
    if ($("edObs")) $("edObs").oninput = () => { e.obs = $("edObs").value; e.cambiado = true; };
    $("edAddSec").onclick = () => { const n = prompt("Nombre del sector nuevo"); if (n && n.trim()) { e.rows.push({ sector: n.trim(), n: "", h: "", fijo: false }); e.cambiado = true; pintar(); } };
    $("edReset").onclick = () => { cargarPlan(e.plan); render(); };
    $("edSeed").onclick = async () => { if (!confirm("¿Restaurar TODAS las planillas a las originales? Se pierden las ediciones.")) return; try { await B.guardarDatos(SEED); st.ed = null; toast("Planillas restauradas"); } catch (er) { toast(er.message); } };
    $("edSave").onclick = async () => {
      const filas = e.rows.map(r => ({ ...r, n: r.n.trim(), h: r.h.trim() })).filter(r => r.n);
      const err = [];
      if (!e.fecha) err.push("Falta la fecha de la planilla.");
      const f = e.fecha && parseYMD(e.fecha);
      if (f && e.plan === "semana" && f.getDay() !== 1) err.push("La fecha tiene que ser un lunes.");
      if (f && esFinde && f.getDay() !== 6) err.push("La fecha tiene que ser un sábado.");
      if (f && esFinde && f.getDay() === 6 && L.grupoFinde(f) !== g) err.push(`El ${corto(f)} no trabaja el Grupo ${g} (trabaja el ${L.grupoFinde(f)}).`);
      if (f && e.plan === "feriado" && !L.feriadoAlterna(f)) err.push("Esa fecha no es un feriado de lunes a viernes.");
      const vistos = new Set();
      filas.forEach(r => {
        if (vistos.has(norm(r.n))) err.push(`${r.n} está repetido.`); vistos.add(norm(r.n));
        if (!(e.plan === "semana" && /^Sin horario/.test(r.h)) && L.minutos(r.h) === null) err.push(`Horario no válido para ${r.n}: "${r.h}". Usá "7 a 15" o "9 a 13 · 18 a 22".`);
      });
      if (err.length) { $("edMsg").innerHTML = err.map(esc).join("<br>"); $("edMsg").style.color = "var(--bad)"; return; }
      const D = L.getData();
      if (e.plan === "semana") {
        D.SECTORES = sectoresDe(filas).map(s => ({ nombre: s, personas: filas.filter(r => r.sector === s).map(r => r.fijo ? { n: r.n, h: r.h, fijo: true } : { n: r.n, h: r.h }) }));
        D.BASE_LUNES = e.fecha;
      } else {
        const lista = filas.map(r => r.fijo ? [r.sector, r.n, r.h, 1] : [r.sector, r.n, r.h]);
        if (e.plan === "feriado") { D.FERIADO_PLANILLA.B = { ref: DIAS[f.getDay()] + " " + corto(f) + " " + f.getFullYear(), lista }; D.FERIADO_BASE = e.fecha; }
        else {
          const [gg, dia] = e.plan.split("_");
          D.FINDE[gg][dia] = lista; D.FINDE[gg].base = e.fecha; D.FINDE[gg].obs = e.obs.trim();
          D.FINDE[gg].ref = corto(f) + " y " + corto(addDays(f, 1)) + " " + f.getFullYear();
        }
      }
      try { await B.guardarDatos(D); e.cambiado = false; $("edMsg").style.color = ""; $("edMsg").textContent = "✓ Planilla guardada. Ya la ven todos."; toast("Planilla guardada"); }
      catch (er) { $("edMsg").textContent = er.message; }
    };
  }

  // Modo local: la clave de Gemini se guarda solo en este dispositivo y el teléfono habla directo con Gemini.
  function admIALocal(root) {
    const lista = B.iaLista();
    root.innerHTML = `<div class="card"><h3>Inteligencia artificial (Gemini)</h3>
        <p class="muted" style="margin-top:0">La usan el asistente (pestaña IA) y la carga de ofertas. Como la app está en modo local, este teléfono habla directo con Gemini y la clave queda guardada <b>solo en este dispositivo</b> (no se sube a ningún lado). Cada administrador la pega en su propio teléfono.</p>
        <div class="muted" id="iaMsg2" style="margin-bottom:8px">${lista ? "✓ Hay una clave guardada en este teléfono." : "Todavía no hay clave en este teléfono."}</div>
        <div class="field"><label>Clave de Gemini (Google AI Studio)</label><input class="in" id="iaKG" type="password" autocomplete="off" placeholder="Pegá la clave (AIza… o AQ.…)"></div>
        <div class="row"><button class="btn pri" id="iaGuardar">Probar y guardar</button>${lista ? '<button class="btn" id="iaBorrarK">Quitar clave</button>' : ""}</div>
        <p class="muted" style="margin-bottom:0">¿No tenés clave? Se saca gratis en aistudio.google.com → Get API key.</p></div>
      <div class="card"><h3>Fotos de los productos (Ofertas)</h3>
        <p class="muted" style="margin:0">En modo local la app no busca fotos en Google: subí la foto del producto desde el teléfono (en la carga de ofertas o adjuntándola en el chat del asistente).</p></div>`;
    $("iaGuardar").onclick = async () => {
      const g = $("iaKG").value.trim(); if (!g) return toast("Pegá la clave de Gemini");
      $("iaGuardar").disabled = true; $("iaMsg2").textContent = "Probando la clave…";
      try { await B.guardarClaveIA({ proveedor: "gemini", gemini: g }); $("iaKG").value = ""; toast("✓ Clave de Gemini guardada en este teléfono"); admIALocal(root); }
      catch (e) { $("iaMsg2").textContent = "✕ " + e.message; $("iaGuardar").disabled = false; }
    };
    if ($("iaBorrarK")) $("iaBorrarK").onclick = () => { if (!confirm("¿Quitar la clave de Gemini de este teléfono?")) return; IALocal.guardarClave(""); toast("Clave quitada"); admIALocal(root); };
  }

  // Claves de IA: se guardan en el servidor y no se pueden volver a leer desde la app.
  function admIA(root) {
    if (!B.online) return admIALocal(root);
    root.innerHTML = `<div class="card"><h3>Proveedor de inteligencia artificial</h3>
        <p class="muted" style="margin-top:0">Lo usan el asistente (pestaña IA) y la carga de ofertas. Las claves quedan guardadas en el servidor: nadie las puede volver a ver desde la app (para cambiar una, pegá la nueva).</p>
        <div class="seg" id="iaProv"><button data-p="gemini" class="on">Gemini (Google)</button><button data-p="claude">Claude (Anthropic)</button></div>
        <div class="field" style="margin-top:10px"><label>Clave de Gemini (Google AI Studio)</label><input class="in" id="iaKG" type="password" autocomplete="off" placeholder="Pegá la clave (AIza… o AQ.…)"></div>
        <div class="field"><label>Clave de Anthropic (opcional)</label><input class="in" id="iaKA" type="password" autocomplete="off" placeholder="sk-ant-…"></div>
        <div class="muted" id="iaMsg2"></div>
        <button class="btn pri" id="iaGuardar">Guardar</button></div>
      <div class="card"><h3>Fotos de los productos (Ofertas)</h3>
        <p class="muted" style="margin-top:0">Cómo se buscan en Google las fotos de los productos con descuento.</p>
        <select class="in" id="imgProv"><option value="gemini">Gemini con búsqueda de Google (usa la clave de Gemini; requiere facturación activa)</option><option value="serper">Serper.dev (Google Imágenes, 2.500 búsquedas gratis)</option><option value="google">Google Programmable Search</option><option value="ninguno">No buscar: subo las fotos a mano</option></select>
        <div class="row" style="margin-top:8px"><input class="in f oculto" id="imgClave" type="password" autocomplete="off" placeholder="Clave del buscador"><input class="in f oculto" id="imgCx" placeholder="ID del buscador (cx)"></div>
        <button class="btn pri" id="imgGuardar" style="margin-top:8px">Guardar</button></div>`;
    let prov = "gemini";
    $("iaProv").querySelectorAll("button").forEach(b => b.onclick = () => { prov = b.dataset.p; $("iaProv").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); });
    $("iaGuardar").onclick = async () => {
      const cfg = { proveedor: prov }, g = $("iaKG").value.trim(), a = $("iaKA").value.trim();
      if (g) cfg.gemini = g; if (a) cfg.anthropic = a;
      try { await B.guardarClaveIA(cfg); $("iaKG").value = $("iaKA").value = ""; $("iaMsg2").textContent = `✓ Guardado. Proveedor: ${prov === "gemini" ? "Gemini" : "Claude"}.`; toast("✓ Configuración de IA guardada"); }
      catch (e) { toast(e.message); }
    };
    const vis = () => { const v = $("imgProv").value; $("imgClave").classList.toggle("oculto", v !== "serper" && v !== "google"); $("imgCx").classList.toggle("oculto", v !== "google"); };
    $("imgProv").onchange = vis; vis();
    $("imgGuardar").onclick = async () => {
      const v = $("imgProv").value, cfg = { proveedor: v };
      if (v === "serper" || v === "google") { cfg.clave = $("imgClave").value.trim(); if (!cfg.clave) return toast("Pegá la clave del buscador"); }
      if (v === "google") { cfg.cx = $("imgCx").value.trim(); if (!cfg.cx) return toast("Falta el ID del buscador (cx)"); }
      try { await B.guardarClaveImagenes(cfg); $("imgClave").value = ""; toast("✓ Buscador de fotos guardado"); } catch (e) { toast(e.message); }
    };
  }

  function admPersonas(root) {
    const D = L.datos(), ps = L.personas();
    const gf = D.GRUPO_FIJO || {}, tf = D.TRABAJO_FERIADO_BASE || {};
    const puentes = [];
    Object.entries(D.PUENTES || {}).forEach(([y, l]) => l.forEach(x => puentes.push(x + " puente")));
    Object.entries(D.FERIADOS_EXTRA || {}).forEach(([x, n]) => puentes.push(x + " feriado " + n));
    (D.FERIADOS_QUITAR || []).forEach(x => puentes.push(x + " quitar"));
    root.innerHTML = `<div class="card"><h3>Grupo de fin de semana y feriados por persona</h3>
        <p class="muted" style="margin-top:0">"Automático" usa las planillas. Cambialo solo para quien trabaja findes o feriados sin figurar en la planilla (por ejemplo, Pacheco Julián: Grupo B).</p>
        <table id="tPer">${ps.map(p => {
          const ga = L.grupoPlanilla(p.n), fa = L.feriadoPlanilla(p.n);
          return `<tr data-n="${esc(p.n)}"><td><b>${esc(p.n)}</b><div class="muted">${esc(p.sector)}</div></td><td>
            <select class="in" data-k="g" style="margin-bottom:4px"><option value="auto">Finde: auto (${ga === "AB" ? "A y B" : ga || "ninguno"})</option>${["A", "B", "AB", ""].map(v => `<option value="${v}" ${p.n in gf && gf[p.n] === v ? "selected" : ""}>Finde: ${v === "AB" ? "A y B" : v ? "Grupo " + v : "no trabaja"}</option>`).join("")}</select>
            <select class="in" data-k="f"><option value="auto">Feriado ${esc(D.FERIADO_PLANILLA.B.ref)}: auto (${fa ? "trabajó" : "descansó"})</option><option value="1" ${tf[p.n] === true ? "selected" : ""}>Trabajó el ${esc(D.FERIADO_PLANILLA.B.ref)}</option><option value="0" ${tf[p.n] === false ? "selected" : ""}>Descansó el ${esc(D.FERIADO_PLANILLA.B.ref)}</option></select>
          </td></tr>`;
        }).join("")}</table>
        <button class="btn pri" id="perOk" style="margin-top:10px">Guardar</button></div>
      <div class="card"><h3>Puentes y correcciones de feriados</h3>
        <p class="muted" style="margin-top:0">Los feriados nacionales se calculan solos. Acá cargá los puentes turísticos de cada año cuando el Gobierno los publique, o correcciones. Una línea por fecha:<br><code>2027-03-22 puente</code> · <code>2027-05-24 feriado Nombre</code> · <code>2027-11-20 quitar</code></p>
        <textarea class="in" id="ferTxt" rows="6">${esc(puentes.join("\n"))}</textarea>
        <div class="muted" id="ferMsg"></div>
        <button class="btn pri" id="ferOk" style="margin-top:8px">Guardar feriados</button></div>
      <div class="card"><h3>Alternancia de grupos</h3>
        <p class="muted" style="margin-top:0">El sábado ${esc(D.FINDE_BASE_SABADO)} trabajó el Grupo ${esc(D.FINDE_BASE_GRUPO)} y a partir de ahí se alternan. Si la farmacia cambia el orden, invertilo acá.</p>
        <button class="btn" id="invOk">Invertir grupos</button></div>`;
    $("perOk").onclick = async () => {
      const D2 = L.getData(); D2.GRUPO_FIJO = {}; D2.TRABAJO_FERIADO_BASE = {};
      $("tPer").querySelectorAll("tr[data-n]").forEach(tr => {
        const n = tr.dataset.n, g = tr.querySelector('[data-k="g"]').value, f = tr.querySelector('[data-k="f"]').value;
        if (g !== "auto") D2.GRUPO_FIJO[n] = g;
        if (f !== "auto") D2.TRABAJO_FERIADO_BASE[n] = f === "1";
      });
      try { await B.guardarDatos(D2); toast("Guardado"); } catch (er) { toast(er.message); }
    };
    $("ferOk").onclick = async () => {
      const D2 = L.getData(); D2.PUENTES = {}; D2.FERIADOS_EXTRA = {}; D2.FERIADOS_QUITAR = [];
      const malas = [];
      $("ferTxt").value.split("\n").map(x => x.trim()).filter(Boolean).forEach(l => {
        const m = l.match(/^(\d{4})-(\d{2})-(\d{2})\s+(puente|feriado|quitar)\s*(.*)$/i);
        if (!m || isNaN(parseYMD(l.slice(0, 10)))) return malas.push(l);
        const f = l.slice(0, 10), t = m[4].toLowerCase();
        if (t === "puente") (D2.PUENTES[m[1]] = D2.PUENTES[m[1]] || []).push(f);
        if (t === "feriado") D2.FERIADOS_EXTRA[f] = m[5] || "Feriado";
        if (t === "quitar") D2.FERIADOS_QUITAR.push(f);
      });
      if (malas.length) { $("ferMsg").textContent = "No entendí: " + malas.join(" | "); return; }
      try { await B.guardarDatos(D2); toast("Feriados guardados"); } catch (er) { toast(er.message); }
    };
    $("invOk").onclick = async () => {
      if (!confirm("¿Invertir qué grupo trabaja cada finde? Revisá después las fechas de las planillas de finde.")) return;
      const D2 = L.getData(); D2.FINDE_BASE_GRUPO = L.otro(D2.FINDE_BASE_GRUPO);
      const a = D2.FINDE.A.base, b = D2.FINDE.B.base; D2.FINDE.A.base = b; D2.FINDE.B.base = a;
      try { await B.guardarDatos(D2); toast("Grupos invertidos"); } catch (er) { toast(er.message); }
    };
  }

  /* ============================== NOTIFICACIONES ============================== */
  function chipEstado(c) {
    const e = c.estado || "aceptado";
    return e === "pendiente" ? `<span class="pill pend">⏳ Pendiente</span>` : e === "rechazado" ? `<span class="pill bad">✕ Rechazado</span>` : `<span class="pill ok">✓ Aceptado</span>`;
  }
  // los cambios de varios días cargados juntos forman un "lote" y se aprueban juntos
  function lotes(lista) {
    const m = new Map();
    lista.forEach(c => { const k = c.lote || c.id; if (!m.has(k)) m.set(k, []); m.get(k).push(c); });
    return [...m.entries()].map(([id, cs]) => {
      cs.sort((a, b) => a.fecha < b.fecha ? -1 : 1);
      const est = cs.some(c => c.estado === "pendiente") ? "pendiente" : cs.some(c => c.estado === "rechazado") ? "rechazado" : "aceptado";
      return { id, cs, primero: cs[0], estado: est, creado: Math.max(...cs.map(c => c.creado || 0)), respondido: Math.max(...cs.map(c => c.respondido || 0)) };
    }).sort((a, b) => b.creado - a.creado);
  }
  function textoLote(l) {
    const a = parseYMD(l.cs[0].fecha), z = parseYMD(l.cs[l.cs.length - 1].fecha), c = l.primero;
    const cuando = l.cs.length === 1 ? `${DIAS[a.getDay()]} ${corto(a)}` : `del ${corto(a)} al ${corto(z)}`;
    return { cuando, que: c.t ? (c.h ? "trabajás " + c.h : "trabajás") : "franco" };
  }
  const misLotes = () => st.user && st.user.tipo === "empleado" ? lotes(st.cambios.filter(c => norm(c.persona) === norm(st.user.persona))) : [];
  const vistos = k => { try { return new Set(JSON.parse(localStorage.getItem(k) || "[]")); } catch (e) { return new Set(); } };
  const guardarVistos = (k, set) => { try { localStorage.setItem(k, JSON.stringify([...set].slice(-300))); } catch (e) {} };

  function procesarNotifs() {
    if (!st.user) return;
    const esAdmin = st.user.tipo === "admin";
    let pend = 0;
    if (!esAdmin) {
      const k = "mh_nv_" + norm(st.user.persona), v = vistos(k);
      misLotes().filter(l => l.estado === "pendiente").forEach(l => {
        pend++;
        if (v.has(l.id)) return;
        v.add(l.id);
        const t = textoLote(l);
        const titulo = "Cambio en tu horario", texto = `${t.cuando[0].toUpperCase() + t.cuando.slice(1)}: ${t.que}. Lo cargó ${l.primero.por || "un administrador"}. Tocá para aprobarlo.`;
        banner(titulo, texto);
        Notif.mostrar(l.id, titulo, texto);
      });
      guardarVistos(k, v);
    } else {
      // respuestas de los empleados
      const k = "mh_rv_" + st.user.usuario, v = vistos(k), primera = !localStorage.getItem(k);
      lotes(st.cambios).filter(l => l.respondido && l.estado !== "pendiente").forEach(l => {
        if (v.has(l.id + l.respondido)) return;
        v.add(l.id + l.respondido);
        if (Date.now() - l.respondido > 86400000 * 3 || primera) return;
        pend++;
        const t = textoLote(l), ok = l.estado === "aceptado";
        const titulo = `${l.primero.persona} ${ok ? "aceptó" : "rechazó"} el cambio`;
        const texto = `${t.cuando[0].toUpperCase() + t.cuando.slice(1)}: ${t.que}.${l.cs.find(c => c.respuesta) ? " Motivo: " + l.cs.find(c => c.respuesta).respuesta : ""}`;
        banner(titulo, texto);
        Notif.mostrar("r" + l.id, titulo, texto);
      });
      guardarVistos(k, v);
      pend = lotes(st.cambios).filter(l => l.estado === "pendiente").length;
    }
    const bd = $("notifBadge"); if (bd) { bd.textContent = pend; bd.classList.toggle("oculto", !pend); }
  }

  function banner(titulo, texto) {
    const b = $("banner");
    b.innerHTML = `<img src="img/logo.svg" alt=""><div class="grow"><b>${esc(titulo)}</b><div>${esc(texto)}</div></div><button class="btn sm acc">Ver</button>`;
    b.classList.remove("on"); void b.offsetWidth; b.classList.add("on");
    b.onclick = () => { b.classList.remove("on"); abrirNotificaciones(); };
    clearTimeout(banner.t); banner.t = setTimeout(() => b.classList.remove("on"), 7000);
  }

  function abrirNotificaciones() {
    if (!st.user) return;
    const esAdmin = st.user.tipo === "admin";
    const ls = esAdmin ? lotes(st.cambios).filter(l => Date.now() - l.creado < 86400000 * 30) : misLotes();
    const estadoNotif = Notif.estado();
    const pie = estadoNotif === "granted" ? "" : estadoNotif === "denied"
      ? `<p class="muted">Las notificaciones están bloqueadas. Activalas en los ajustes del ${Notif.nativo ? "teléfono" : "navegador"} para enterarte de los cambios.</p>`
      : estadoNotif === "no-soportado" ? "" : `<button class="btn pri" id="nfPermiso" style="width:100%;margin-bottom:10px">🔔 Activar notificaciones</button>`;
    $("sheetBody").innerHTML = `<h3 style="margin:0 0 4px">Notificaciones</h3>
      <p class="muted" style="margin:0 0 12px">${esAdmin ? "Cambios cargados y respuestas de los empleados (últimos 30 días)." : "Cambios que un administrador hizo en tu horario."}</p>${pie}
      <div class="list">${ls.length ? ls.map(l => {
        const t = textoLote(l), c = l.primero, resp = l.cs.find(x => x.respuesta);
        return `<div class="it notif ${l.estado}" data-l="${esc(l.id)}">
          <div class="nico">${l.estado === "pendiente" ? "⏳" : l.estado === "aceptado" ? "✓" : "✕"}</div>
          <div class="grow">
            <b>${esAdmin ? esc(c.persona) + " · " : ""}${esc(t.cuando)}</b>
            <div>${c.t ? "Trabaja <b>" + esc(c.h || "horario a confirmar") + "</b>" : "<b>Franco</b>"}</div>
            ${c.nota ? `<div class="muted">📝 ${esc(c.nota)}</div>` : ""}
            <div class="muted">Cargado por ${esc(c.por || "—")} · ${new Date(l.creado).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</div>
            <div style="margin-top:6px">${chipEstado(l)}${resp ? ` <span class="muted">“${esc(resp.respuesta)}”</span>` : ""}</div>
            ${!esAdmin && l.estado === "pendiente" ? `<div class="row" style="margin-top:8px">
              <button class="btn acc" data-r="aceptado">✓ Aceptar</button><button class="btn bad" data-r="rechazado">✕ Rechazar</button></div>
              <div class="row oculto" data-motivo style="margin-top:8px"><input class="in f" placeholder="Motivo (opcional)"><button class="btn pri" data-r="rechazar-ok">Enviar</button></div>` : ""}
          </div></div>`;
      }).join("") : `<div class="empty">No hay notificaciones.</div>`}</div>`;
    $("sheet").classList.remove("oculto"); requestAnimationFrame(() => $("sheet").classList.add("on"));
    if ($("nfPermiso")) $("nfPermiso").onclick = async () => { await Notif.pedir(); setTimeout(() => { abrirNotificaciones(); registrarPush(); }, 900); };
    $("sheetBody").querySelectorAll(".notif").forEach(it => {
      const l = ls.find(x => x.id === it.dataset.l);
      it.querySelectorAll("[data-r]").forEach(b => b.onclick = async () => {
        const r = b.dataset.r;
        if (r === "rechazado") { it.querySelector("[data-motivo]").classList.remove("oculto"); it.querySelector("[data-motivo] input").focus(); return; }
        const estado = r === "aceptado" ? "aceptado" : "rechazado";
        const motivo = r === "rechazar-ok" ? it.querySelector("[data-motivo] input").value.trim() : "";
        try {
          await B.responderCambio(l.cs.filter(c => c.estado === "pendiente").map(c => c.id), estado, motivo);
          toast(estado === "aceptado" ? "Cambio aceptado ✓" : "Cambio rechazado");
          setTimeout(abrirNotificaciones, 250);
        } catch (er) { toast(er.message); }
      });
    });
  }
  function cerrarNotificaciones() { $("sheet").classList.remove("on"); setTimeout(() => $("sheet").classList.add("oculto"), 300); }
  window.abrirNotificaciones = abrirNotificaciones;
  function abrirHoja(html) {
    $("sheetBody").innerHTML = html;
    if ($("sheet").classList.contains("oculto")) { $("sheet").classList.remove("oculto"); requestAnimationFrame(() => $("sheet").classList.add("on")); }
  }
  window.MH = { st, B, toast, esc, abrirHoja, cerrarHoja: cerrarNotificaciones };
  $("bNotif").onclick = abrirNotificaciones;
  $("sheet").onclick = e => { if (e.target.id === "sheet" || e.target.closest("[data-cerrar]")) cerrarNotificaciones(); };
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("message", e => { if (e.data && e.data.abrir === "notificaciones") abrirNotificaciones(); });


  /* ============================== ASISTENTE DE IA (administradores) ============================== */
  const SUGERENCIAS = [
    "¿Quién trabaja este sábado?",
    "Dale franco a Pacheco el jueves",
    "¿Qué horario tiene Rojas la semana que viene?",
    "Avisá a todos que el lunes hay reunión a las 9",
    "¿Quiénes trabajan el próximo feriado?",
    "Cambiá el horario de Vallejos en la planilla semanal a 8 a 16",
  ];
  const IA = st.ia = { mensajes: [], cargando: false, adjuntos: [], leer: false, rev: 0, pintado: -1 };
  const claveIA = () => "mh_ia_" + (st.user && st.user.usuario);
  function cargarIA() {
    try { const g = JSON.parse(localStorage.getItem(claveIA()) || "{}"); IA.mensajes = g.mensajes || []; IA.leer = !!g.leer; } catch (e) { IA.mensajes = []; }
    IA.mensajes.forEach(m => (m.propuestas || []).forEach(p => { if (p.estado === "aplicando") p.estado = "pendiente"; }));
    IA.rev++;
  }
  function guardarIA() {
    try { localStorage.setItem(claveIA(), JSON.stringify({ leer: IA.leer, mensajes: IA.mensajes.slice(-60).map(m => ({ ...m, imagenes: m.imagenes ? m.imagenes.length : 0 })) })); } catch (e) {}
  }
  const pendientes = () => IA.mensajes.flatMap(m => m.propuestas || []).filter(p => p.estado === "pendiente");

  // Aplica una propuesta con los datos ACTUALES (la misma validación que usó el servidor).
  async function aplicarPropuesta(p) {
    p.estado = "aplicando"; IA.rev++; pintarIA();
    try {
      const r = Acciones.aplicar(L.getData(), { tipo: p.tipo, datos: p.datos }, { empleados: st.empleados });
      if (r.datos) { await B.guardarDatos(r.datos); L.setData(r.datos); olvidar(); }
      for (const op of r.ops) {
        if (op.tipo === "cambios") {
          const lote = "L" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          await B.guardarCambios(op.lista.map(c => ({ ...c, por: st.user.usuario, estado: "pendiente", lote })));
        } else if (op.tipo === "borrarCambios") {
          const n = norm(op.persona);
          for (const c of st.cambios.filter(c => norm(c.persona) === n && c.fecha >= op.desde && c.fecha <= op.hasta)) await B.borrarCambio(c.id);
        } else if (op.tipo === "aviso") await B.publicarAviso(op.texto, st.user.usuario);
        else if (op.tipo === "borrarEmpleado") {
          const e = st.empleados.find(x => norm(x.persona) === norm(op.persona));
          if (!e) throw new Error(`${op.persona} no tiene cuenta registrada.`);
          await B.borrarEmpleado(e.id);
        } else if (op.tipo === "oferta") {
          await B.guardarOferta({ ...op.oferta, imagen: p.foto || null, creado: Date.now(), por: st.user.usuario });
        } else if (op.tipo === "reasignarEmpleado") {
          const e = st.empleados.find(x => norm(x.persona) === norm(op.de));
          if (e) await B.reasignarEmpleado(e.id, op.a);
        }
      }
      p.estado = "aplicada";
    } catch (er) { p.estado = "error"; p.error = er.message; }
    IA.rev++; guardarIA(); pintarIA();
    return p.estado === "aplicada";
  }
  async function aplicarPendientes() {
    let ok = 0, mal = 0;
    for (const p of pendientes()) (await aplicarPropuesta(p)) ? ok++ : mal++;
    if (ok || mal) toast(mal ? `Aplicadas ${ok}, con error ${mal}` : `✓ ${ok === 1 ? "Cambio aplicado" : ok + " cambios aplicados"}`);
    return { ok, mal };
  }
  function descartarPendientes() { pendientes().forEach(p => { p.estado = "descartada"; }); IA.rev++; guardarIA(); pintarIA(); }

  async function enviarIA(texto, opciones) {
    opciones = opciones || {};
    texto = String(texto || "").trim();
    if (!texto && !IA.adjuntos.length) return null;
    if (!B.iaLista()) { mostrarClaveIA(true); toast("Primero pegá la clave de Gemini"); if ($("iaTxt") && !$("iaTxt").value) $("iaTxt").value = texto; return null; }
    const imagenes = IA.adjuntos.splice(0);
    IA.mensajes.push({ rol: "yo", texto, imagenes: imagenes.map(i => i.url), t: Date.now() });
    IA.cargando = true; IA.rev++; pintarIA();
    let resp;
    try {
      resp = await B.asistente({ mensaje: texto, imagenes: imagenes.map(i => ({ tipo: i.tipo, datos: i.datos })), pendientes: pendientes().length, nombre: nombreAdmin() });
      const m = { rol: "ia", texto: resp.texto || "", nota: resp.nota || "", propuestas: (resp.propuestas || []).map(p => ({ ...p, estado: "pendiente" })), t: Date.now() };
      // ofertas: la foto adjunta va al flyer (achicada)
      const ofs = m.propuestas.filter(p => p.tipo === "oferta");
      for (const p of ofs) {
        let i = Number(p.datos && p.datos.foto_adjunta) - 1;
        if (!(i >= 0) && ofs.length === 1 && imagenes.length === 1) i = 0;
        if (imagenes[i]) { try { p.foto = await achicarURL(imagenes[i].url, 720); p.advertencias = (p.advertencias || []).filter(a => !/^Sin foto/.test(a)); } catch (e) {} }
      }
      if (resp.descartar) descartarPendientes();
      IA.mensajes.push(m);
      if (resp.confirmar) { IA.cargando = false; await aplicarPendientes(); }
    } catch (er) {
      if (er.codigo === "sinClave") mostrarClaveIA(true);
      IA.mensajes.push({ rol: "ia", error: true, texto: er.message, t: Date.now() });
      resp = { texto: er.message, error: true };
    }
    IA.cargando = false; IA.rev++; guardarIA(); pintarIA();
    if (!opciones.vivo && (opciones.voz || IA.leer) && resp && resp.texto) Voz.hablar(resp.texto);
    return resp;
  }

  // Foto (por ejemplo, de una planilla nueva): se achica antes de mandarla.
  function achicarImagen(archivo) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(archivo), img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const d = c.toDataURL("image/jpeg", 0.86); URL.revokeObjectURL(url);
        res({ tipo: "image/jpeg", datos: d.split(",")[1], url: d });
      };
      img.onerror = () => rej(new Error("No pude abrir la imagen."));
      img.src = url;
    });
  }

  function achicarURL(url, max) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => rej(new Error("No pude abrir la imagen."));
      img.src = url;
    });
  }

  // Modo local sin clave: tarjeta para pegar la clave de Gemini ahí mismo, en el chat.
  function mostrarClaveIA(si) {
    const c = $("iaClave"); if (!c) return;
    c.classList.toggle("oculto", !si);
    const sub = $("iaSub"); if (sub) sub.textContent = subtituloIA();
    if (si) setTimeout(() => $("iaClaveIn") && $("iaClaveIn").focus(), 200);
  }
  const subtituloIA = () => B.online ? "Consultas y cambios por texto, voz o foto" : B.iaLista() ? "Con Gemini, directo desde este teléfono" : "Falta pegar la clave de Gemini";

  function formatoIA(t) { return esc(t).replace(/\n/g, "<br>"); }
  function htmlPropuesta(p, i, mi) {
    const est = { pendiente: "", aplicando: '<span class="pill pend"><span class="spin"></span>Aplicando…</span>', aplicada: '<span class="pill ok">✓ Aplicada</span>', descartada: '<span class="pill">Descartada</span>', error: `<span class="pill bad">✕ ${esc(p.error || "Error")}</span>` }[p.estado] || "";
    return `<div class="prop ${p.estado}"><div class="prop-ico">${p.tipo === "aviso" ? "📢" : p.tipo === "cambio_turno" ? "🔁" : p.tipo.includes("planilla") ? "📋" : p.tipo === "feriado" ? "📅" : p.tipo === "borrar_empleado" ? "🗑" : p.tipo === "oferta" ? "🏷" : "⚙️"}</div>
      <div class="grow">${p.foto ? `<img class="prop-foto" src="${esc(p.foto)}" alt="">` : ""}<div>${esc(p.descripcion)}</div>${(p.advertencias || []).map(a => `<div class="muted">⚠ ${esc(a)}</div>`).join("")}
      ${p.estado === "pendiente" ? `<div class="row" style="margin-top:8px"><button class="btn sm acc" data-ap="${mi}:${i}">Aplicar</button><button class="btn sm" data-de="${mi}:${i}">Descartar</button></div>` : `<div style="margin-top:6px">${est}</div>`}</div></div>`;
  }
  function pintarIA() {
    const box = $("iaMsgs"); if (!box || IA.pintado === IA.rev) return;
    IA.pintado = IA.rev;
    const n = pendientes().length;
    box.innerHTML = IA.mensajes.map((m, mi) => m.rol === "yo"
        ? `<div class="burb yo">${(m.imagenes && m.imagenes.length ? (Array.isArray(m.imagenes) ? m.imagenes.map(u => `<img src="${esc(u)}" alt="">`).join("") : `<div class="muted">📷 ${m.imagenes} foto(s)</div>`) : "")}${formatoIA(m.texto)}</div>`
        : `<div class="burb ia ${m.error ? "err" : ""}">${formatoIA(m.texto)}${m.nota ? `<div class="muted" style="margin-top:6px">${esc(m.nota)}</div>` : ""}
            ${(m.propuestas || []).length ? `<div class="props">${m.propuestas.map((p, i) => htmlPropuesta(p, i, mi)).join("")}</div>` : ""}</div>`).join("") +
      (IA.cargando ? `<div class="burb ia pensando"><span></span><span></span><span></span></div>` : "");
    $("iaSug").classList.toggle("oculto", IA.mensajes.length > 0);
    caraPensando(IA.cargando);
    $("iaHola").classList.toggle("compacto", IA.mensajes.length > 0);
    $("iaTodo").classList.toggle("oculto", n < 2);
    $("iaTodo").textContent = `Aplicar todo (${n})`;
    $("iaAdj").innerHTML = IA.adjuntos.map((a, i) => `<div class="adj"><img src="${a.url}" alt=""><button data-qa="${i}" aria-label="Quitar">✕</button></div>`).join("");
    $("iaAdj").querySelectorAll("[data-qa]").forEach(b => b.onclick = () => { IA.adjuntos.splice(+b.dataset.qa, 1); IA.rev++; pintarIA(); });
    box.querySelectorAll("[data-ap]").forEach(b => b.onclick = () => { const [mi, i] = b.dataset.ap.split(":").map(Number); aplicarPropuesta(IA.mensajes[mi].propuestas[i]).then(ok => ok && toast("✓ Aplicado")); });
    box.querySelectorAll("[data-de]").forEach(b => b.onclick = () => { const [mi, i] = b.dataset.de.split(":").map(Number); IA.mensajes[mi].propuestas[i].estado = "descartada"; IA.rev++; guardarIA(); pintarIA(); });
    requestAnimationFrame(() => box.lastElementChild && box.lastElementChild.scrollIntoView({ behavior: "smooth", block: "end" }));
    if ($("vivo") && !$("vivo").classList.contains("oculto")) pintarVivo();
  }

  function renderIA() {
    const v = $("v-ia");
    if (!$("iaMsgs")) {
      if (!IA.cargado || IA.cargado !== st.user.usuario) { cargarIA(); IA.cargado = st.user.usuario; }
      v.innerHTML = `<div class="ia-vista">
        <div class="ia-top"><div class="orbe-slot" id="iaOrbeTop"></div><div class="grow"><b>Asistente IA</b><div class="muted" id="iaSub">${subtituloIA()}</div></div>
          <button class="iconbtn ${IA.leer ? "on" : ""}" id="iaLeer" title="Leer respuestas en voz alta" aria-label="Leer respuestas en voz alta">🔊</button>
          <button class="iconbtn" id="iaNueva" title="Nueva conversación" aria-label="Nueva conversación">＋</button></div>
        <div class="ia-hola" id="iaHola">
          <div class="orbe-slot" id="iaOrbeHola"></div>
          <h3 id="iaSaludo" aria-live="polite"></h3>
          <p class="muted" id="iaIntro"></p>
          <form class="row oculto" id="iaNombreF" autocomplete="off"><input class="in f" id="iaNombre" maxlength="80" placeholder="Nombre y apellido"><button class="btn pri">Listo</button></form>
        </div>
        <form class="card ia-clave ${B.iaLista() ? "oculto" : ""}" id="iaClave" autocomplete="off">
          <b>🔑 Activar el asistente</b>
          <p class="muted">Pegá tu clave de Gemini una sola vez. Queda guardada <b>solo en este teléfono</b> y el asistente habla directo con Google. Se saca gratis en aistudio.google.com → Get API key.</p>
          <div class="row"><input class="in f" id="iaClaveIn" type="password" placeholder="Clave de Gemini (AIza… o AQ.…)"><button class="btn pri" id="iaClaveOk">Activar</button></div>
          <div class="muted" id="iaClaveMsg"></div>
        </form>
        <div class="ia-msgs" id="iaMsgs"></div>
        <div class="ia-sug" id="iaSug">${SUGERENCIAS.map(t => `<button class="chip2">${esc(t)}</button>`).join("")}</div>
        <button class="btn acc" id="iaTodo" style="margin:6px 0">Aplicar todo</button>
        <div class="ia-adj" id="iaAdj"></div>
        <div class="ia-bar">
          <button class="iconbtn" id="iaFoto" title="Mandar foto de una planilla" aria-label="Adjuntar foto">📷</button>
          <textarea id="iaTxt" rows="1" placeholder="Escribile al asistente…"></textarea>
          <button class="iconbtn mic" id="iaMic" title="Dictar" aria-label="Dictar">🎙</button>
          <button class="iconbtn env" id="iaEnv" title="Enviar" aria-label="Enviar">➤</button>
          <input type="file" id="iaArch" accept="image/*" multiple class="oculto">
        </div>
        <button class="ia-vivo" id="iaVivo"><span class="ia-orbe mini"></span> Conversación en vivo</button>
      </div>`;
      const txt = $("iaTxt");
      const enviar = () => { const t = txt.value; txt.value = ""; txt.style.height = ""; enviarIA(t); };
      txt.oninput = () => { txt.style.height = "auto"; txt.style.height = Math.min(140, txt.scrollHeight) + "px"; };
      txt.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } };
      $("iaEnv").onclick = enviar;
      $("iaSug").querySelectorAll(".chip2").forEach(b => b.onclick = () => enviarIA(b.textContent));
      $("iaTodo").onclick = () => aplicarPendientes();
      $("iaNueva").onclick = async () => {
        if (!confirm("¿Empezar una conversación nueva? Se borra este historial.")) return;
        IA.mensajes = []; IA.rev++; guardarIA(); pintarIA();
        try { await B.asistente({ mensaje: "", nueva: true }); } catch (e) {}
      };
      $("iaLeer").onclick = () => { IA.leer = !IA.leer; $("iaLeer").classList.toggle("on", IA.leer); guardarIA(); if (!IA.leer) Voz.callar(); toast(IA.leer ? "Voy a leer las respuestas en voz alta" : "Lectura en voz alta apagada"); };
      $("iaFoto").onclick = () => $("iaArch").click();
      $("iaArch").onchange = async () => {
        for (const f of [...$("iaArch").files].slice(0, 4 - IA.adjuntos.length)) { try { IA.adjuntos.push(await achicarImagen(f)); } catch (e) { toast(e.message); } }
        $("iaArch").value = ""; IA.rev++; pintarIA();
      };
      $("iaMic").onclick = () => {
        if (Voz.escuchando()) { Voz.detener(); $("iaMic").classList.remove("on"); return; }
        if (!Voz.puedeEscuchar()) return toast("Este dispositivo no permite dictar.");
        Voz.callar(); $("iaMic").classList.add("on"); const antes = txt.value;
        Voz.escuchar({
          onParcial: t => { txt.value = (antes + " " + t).trim(); },
          onFinal: t => { $("iaMic").classList.remove("on"); txt.value = ""; enviarIA((antes + " " + t).trim(), { voz: true }); },
          onError: m => { $("iaMic").classList.remove("on"); toast(m); },
        });
      };
      $("iaVivo").onclick = () => { if (!B.iaLista()) { mostrarClaveIA(true); return toast("Primero pegá la clave de Gemini"); } abrirVivo(); };
      $("iaClave").onsubmit = async e => {
        e.preventDefault();
        const k = $("iaClaveIn").value.trim(); if (!k) return $("iaClaveIn").focus();
        $("iaClaveOk").disabled = true; $("iaClaveMsg").textContent = "Probando la clave…";
        try {
          await B.guardarClaveIA({ proveedor: "gemini", gemini: k });
          $("iaClaveIn").value = ""; $("iaClaveMsg").textContent = ""; mostrarClaveIA(false); toast("✓ Asistente activado");
          if ($("iaTxt").value.trim()) { const t = $("iaTxt").value; $("iaTxt").value = ""; enviarIA(t); }
        } catch (er) { $("iaClaveMsg").textContent = "✕ " + er.message; }
        $("iaClaveOk").disabled = false;
      };
      // la cara del asistente
      $("iaOrbeTop").innerHTML = '<span class="cara-mini" aria-hidden="true"><i></i><i></i></span>';
      IA.caras = [];
      setTimeout(() => { if ($("iaOrbeHola") && IA.caras) IA.caras.push(LiveOrb.mount($("iaOrbeHola"), { size: 148, variant: "webgl", colors: PALETA_IA, label: "Cara del asistente de IA" })); }, 120);
      $("iaNombreF").onsubmit = async e => {
        e.preventDefault();
        const n = $("iaNombre").value.replace(/\s+/g, " ").trim();
        if (n.split(" ").length < 2) { toast("Escribí tu nombre y apellido"); return $("iaNombre").focus(); }
        IA.perfil = { nombreCompleto: n };
        try { await B.guardarPerfil(st.user.clave, IA.perfil); } catch (er) {}
        saludar(true); $("quien").textContent = n;
      };
      saludar(false);
      B.leerPerfil(st.user.clave).then(p => { if (p && p.nombreCompleto && p.nombreCompleto !== nombreAdmin()) { IA.perfil = p; saludar(false); $("quien").textContent = p.nombreCompleto; } }).catch(() => {});
    }
    pintarIA();
  }

  /* ---------- la cara: saludo con nombre y apellido ---------- */
  const PALETA_IA = ["#7a3a72", "#b3bb06", "#eadd12"];   // violeta, verde lima y amarillo de la marca
  const nombreAdmin = () => (IA.perfil && IA.perfil.nombreCompleto) || ((G_ADMINS()[st.user.clave] || {}).nombreCompleto) || "";
  function G_ADMINS() { return window.ADMINS || {}; }
  const primerNombre = () => nombreAdmin().split(" ")[0] || "";
  function saludoHora() { const h = new Date().getHours(); return h < 6 ? "¡Buenas noches" : h < 13 ? "¡Buen día" : h < 20 ? "¡Buenas tardes" : "¡Buenas noches"; }
  function escribir(el, texto, ms) {
    clearInterval(el._t);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = texto; return; }
    let i = 0; el.textContent = "";
    el._t = setInterval(() => { i++; el.textContent = texto.slice(0, i); if (i >= texto.length) clearInterval(el._t); }, ms || 32);
  }
  function saludar(nuevo) {
    if (!$("iaSaludo")) return;
    const n = nombreAdmin();
    $("iaNombreF").classList.toggle("oculto", !!n);
    if (n) {
      escribir($("iaSaludo"), `${saludoHora()}, ${n}!`);
      $("iaIntro").textContent = nuevo ? "Encantado. Ya me acuerdo de tu nombre. ¿En qué te ayudo?"
        : "Soy tu asistente de horarios de La Esquina y Belgrano. Pedime consultas o cambios escribiendo, hablando o con una foto de la planilla. Nada se aplica hasta que lo confirmes.";
    } else {
      escribir($("iaSaludo"), "¡Hola! Soy tu asistente de horarios.");
      $("iaIntro").textContent = "Antes de empezar, ¿cómo es tu nombre y apellido?";
      setTimeout(() => $("iaNombre") && $("iaNombre").focus(), 300);
    }
  }
  // mientras piensa, la cara mira hacia arriba y el color se mueve más rápido
  function caraPensando(si) {
    (IA.caras || []).forEach(c => c && c.setOptions({ lookAt: si ? { x: 0.45, y: 0.6 } : null, speed: si ? 1.8 : 0.55 }));
  }

  /* ---------- conversación en vivo (manos libres) ---------- */
  const VIVO = { activo: false, estado: "", parcial: "", ultimo: "", fallos: 0 };
  function pintarVivo() {
    const v = $("vivo"); if (!v) return;
    const n = pendientes().length;
    v.querySelector(".vivo-orbe").dataset.estado = VIVO.estado;
    if (VIVO.cara) VIVO.cara.setOptions({
      lookAt: VIVO.estado === "pensando" ? { x: 0.45, y: 0.6 } : VIVO.estado === "escuchando" ? { x: 0, y: 0.05 } : VIVO.estado === "pausa" ? { x: 0, y: -0.5 } : null,
      speed: VIVO.estado === "pensando" ? 1.8 : VIVO.estado === "hablando" ? 1.1 : 0.55,
    });
    v.querySelector(".vivo-estado").textContent = { escuchando: "Te escucho…", pensando: "Pensando…", hablando: "Hablando… (tocá para interrumpir)", pausa: "En pausa. Tocá el círculo para seguir." }[VIVO.estado] || "";
    v.querySelector(".vivo-dice").textContent = VIVO.parcial;
    v.querySelector(".vivo-resp").textContent = VIVO.ultimo;
    const ap = v.querySelector(".vivo-aplicar"); ap.classList.toggle("oculto", !n); ap.textContent = n === 1 ? "✓ Aplicar el cambio" : `✓ Aplicar ${n} cambios`;
  }
  function cicloVivo() {
    if (!VIVO.activo) return;
    VIVO.estado = "escuchando"; VIVO.parcial = ""; pintarVivo();
    Voz.escuchar({
      onParcial: t => { VIVO.parcial = t; pintarVivo(); },
      onFinal: async t => {
        VIVO.fallos = 0; VIVO.parcial = t;
        if (/^(terminar|terminá|salir|chau|listo gracias|nada más|eso es todo)\.?$/i.test(t.trim())) { VIVO.ultimo = "¡Hasta luego!"; Voz.hablar("Hasta luego."); return cerrarVivo(); }
        VIVO.estado = "pensando"; pintarVivo();
        const r = await enviarIA(t, { vivo: true });
        if (!VIVO.activo) return;
        VIVO.ultimo = r && r.texto || ""; VIVO.estado = "hablando"; pintarVivo();
        Voz.hablar(VIVO.ultimo, () => { if (VIVO.activo && VIVO.estado === "hablando") cicloVivo(); });
      },
      onError: m => {
        if (!VIVO.activo) return;
        VIVO.fallos++;
        if (VIVO.fallos <= 2 && /No te escuché/.test(m)) return cicloVivo();
        VIVO.estado = "pausa"; VIVO.ultimo = m; pintarVivo();
      },
    });
  }
  function abrirVivo() {
    if (!Voz.puedeEscuchar()) return toast("Este dispositivo no permite hablar con el asistente. Escribile.");
    if (!$("vivo")) {
      const d = document.createElement("div"); d.id = "vivo"; d.className = "vivo oculto";
      d.innerHTML = `<button class="vivo-x" aria-label="Terminar">✕</button>
        <div class="vivo-centro"><button class="vivo-orbe" aria-label="Hablar / interrumpir"><i></i><i></i><i></i><span class="vivo-cara"></span></button>
        <div class="vivo-estado"></div><div class="vivo-dice"></div><div class="vivo-resp"></div>
        <button class="btn acc vivo-aplicar oculto"></button></div>
        <div class="vivo-pie muted">Decí “terminar” para salir</div>`;
      document.body.appendChild(d);
      d.querySelector(".vivo-x").onclick = cerrarVivo;
      d.querySelector(".vivo-orbe").onclick = () => {
        if (VIVO.estado === "hablando") { Voz.callar(); cicloVivo(); }
        else if (VIVO.estado === "pausa") { VIVO.fallos = 0; cicloVivo(); }
        else if (VIVO.estado === "escuchando") { Voz.detener(); VIVO.estado = "pausa"; pintarVivo(); }
      };
      d.querySelector(".vivo-aplicar").onclick = async () => { Voz.callar(); const r = await aplicarPendientes(); VIVO.ultimo = r.mal ? "Algunos cambios dieron error." : "Listo, aplicado."; pintarVivo(); Voz.hablar(VIVO.ultimo, () => VIVO.activo && cicloVivo()); };
    }
    VIVO.activo = true; VIVO.ultimo = ""; VIVO.fallos = 0;
    $("vivo").classList.remove("oculto"); requestAnimationFrame(() => $("vivo").classList.add("on"));
    if (!VIVO.cara) VIVO.cara = LiveOrb.mount($("vivo").querySelector(".vivo-cara"), { size: 180, variant: "webgl", colors: PALETA_IA, label: "Cara del asistente" });
    const pn = primerNombre();
    VIVO.ultimo = pn ? `Hola, ${pn}. Te escucho.` : "Hola, te escucho."; pintarVivo();
    Voz.hablar(VIVO.ultimo, () => cicloVivo());
  }
  function cerrarVivo() {
    VIVO.activo = false; Voz.detener(); Voz.callar();
    if (VIVO.cara) { const c = VIVO.cara; VIVO.cara = null; setTimeout(() => c.destroy(), 320); }
    const v = $("vivo"); if (v) { v.classList.remove("on"); setTimeout(() => v.classList.add("oculto"), 300); }
  }

  /* ============================== APERTURA ============================== */
  (function apertura() {
    const sp = $("splash"); if (!sp) return;
    const quitar = () => { if (sp.parentNode) sp.remove(); };
    sp.addEventListener("click", () => sp.classList.add("saltar"));
    sp.addEventListener("animationend", e => { if (e.target === sp) quitar(); });
    setTimeout(quitar, 4000); // por si el navegador no dispara el evento
  })();

  /* ============================== INICIO ============================== */
  B.init().catch(e => { console.error(e); mostrarLogin("No se pudo conectar: " + e.message); });
})();
