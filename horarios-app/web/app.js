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
    const secs = L.getData().SECTORES;
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
    armarNav(); render();
  }
  B.onUser((u, aviso) => {
    if (st.animando) { st.pendiente = u; return; }
    aplicarUsuario(u, aviso);
  });
  B.on("datos", d => {
    st.datosCargados = true;
    st.datos = d;
    L.setData(d || SEED);
    if (!d && st.user && st.user.tipo === "admin" && B.online) B.guardarDatos(SEED).catch(() => {});
    if (st.user) render();
  });
  B.on("cambios", c => { st.cambios = c || []; if (st.user) render(); });
  B.on("avisos", a => { st.avisos = a || []; if (st.user) render(); });
  B.on("empleados", e => { st.empleados = (e || []).sort((a, b) => (a.persona || "").localeCompare(b.persona || "")); if (st.user) render(); });
  $("bSalir").onclick = () => { if (confirm("¿Cerrar sesión?")) B.salir(); };

  /* ============================== NAVEGACIÓN ============================== */
  const ICON = {
    inicio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/></svg>',
    calendario: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>',
    equipo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14.5c2.6.2 4.2 2 4.5 4.5"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  };
  const NOMBRES = { inicio: "Inicio", calendario: "Calendario", equipo: "Equipo", admin: "Panel" };
  function armarNav() {
    const items = ["inicio", "calendario", "equipo"].concat(st.user.tipo === "admin" ? ["admin"] : []);
    $("nav").innerHTML = items.map(v => `<button data-v="${v}">${ICON[v]}<span>${NOMBRES[v]}</span></button>`).join("");
    $("side").innerHTML = `<img class="logo" src="img/logo.svg" alt="">` + items.map(v => `<button data-v="${v}" title="${NOMBRES[v]}">${ICON[v]}</button>`).join("");
    document.querySelectorAll("[data-v]").forEach(b => b.onclick = () => { st.vista = b.dataset.v; render(); window.scrollTo(0, 0); });
  }

  /* ============================== DATOS DE LA PERSONA ============================== */
  function personaActual() { return st.user.tipo === "admin" ? st.ver : st.user.persona; }
  function cambioDe(nombre, d) {
    const k = ymd(d), n = norm(nombre);
    return st.cambios.filter(c => c.fecha === k && norm(c.persona) === n).sort((a, b) => b.creado - a.creado)[0] || null;
  }
  function estado(nombre, d) {
    const u = L.ubicar(nombre); if (!u) return null;
    const c = cambioDe(nombre, d);
    const r = L.estadoDia(L.getData().SECTORES[u.si], u.pi, d, c ? { manual: { t: !!c.t, h: c.h } } : {});
    if (c) r.cambio = c;
    return r;
  }

  /* ============================== RENDER ============================== */
  function render() {
    if (!st.user) return;
    const esAdmin = st.user.tipo === "admin";
    document.querySelectorAll("[data-v]").forEach(b => b.classList.toggle("on", b.dataset.v === st.vista));
    ["inicio", "calendario", "equipo", "admin"].forEach(v => $("v-" + v).classList.toggle("oculto", v !== st.vista));
    const nombre = personaActual();
    $("avatar").innerHTML = esAdmin ? '<img class="logo-img" src="img/logo.svg" alt="">' : esc(iniciales(nombre));
    const h = new Date().getHours();
    $("saludo").textContent = (h < 12 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches") + (esAdmin ? " · Administrador" : "");
    $("quien").textContent = esAdmin ? st.user.usuario : nombre;

    // selector "ver como" (solo administradores)
    $("verComo").classList.toggle("oculto", !esAdmin || st.vista === "admin");
    if (esAdmin) {
      const ps = L.personas();
      $("selVer").innerHTML = ps.map(p => `<option ${p.n === st.ver ? "selected" : ""}>${esc(p.n)}</option>`).join("");
      $("selVer").onchange = () => { st.ver = $("selVer").value; render(); };
    }
    const ok = !!(nombre && L.ubicar(nombre));
    $("sinPersona").classList.toggle("oculto", ok || st.vista === "admin");
    if (!ok) $("sinPersona").innerHTML = `<h3>Tu nombre no está en la planilla</h3><p class="muted">Tu cuenta está asociada a <b>${esc(nombre)}</b>, que no aparece en la planilla actual. Pedile a un administrador que te asigne a la persona correcta.</p>`;
    if (st.vista === "inicio") ok ? renderInicio(nombre) : ($("v-inicio").innerHTML = "");
    if (st.vista === "calendario") ok ? renderCalendario(nombre) : ($("v-calendario").innerHTML = "");
    if (st.vista === "equipo") renderEquipo(ok ? nombre : null);
    if (st.vista === "admin" && esAdmin) renderAdmin();
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
    if (s.cambio) pills += `<span class="pill ${s.cambio.t ? "ok" : "bad"}">Cambio cargado</span>`;
    const notas = [];
    if (s.cambio && s.cambio.nota) notas.push("📝 " + esc(s.cambio.nota));
    if (s.trabaja && s.h === "Horario a confirmar") notas.push(s.tipo === "finde"
      ? `Trabajás con el Grupo ${s.grupo}, pero no figurás en su planilla: confirmá el horario.`
      : "Te toca trabajar este feriado (uno sí, uno no). No figurás en la planilla del feriado: confirmá el horario.");
    if (s.feriado && s.feriado.tipo === "puente" && !s.manual) notas.push("Día no laborable (puente turístico): se trabaja normal y no cuenta en el “uno sí, uno no”.");
    if (s.tipo === "finde" && s.trabaja && L.getData().FINDE[s.grupo].obs) notas.push("Obs.: " + esc(L.getData().FINDE[s.grupo].obs));
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
    const u = L.ubicar(nombre), sec = L.getData().SECTORES[u.si], lun0 = lunesDe(hoy());
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
    const sinP = !(L.getData().PUENTES || {})[y];
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
    const d = st.fecha, D = L.getData();
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
    const tabs = { empleados: "Empleados", cambios: "Cambios y francos", avisos: "Avisos", planillas: "Planillas", personas: "Grupos y feriados" };
    $("v-admin").innerHTML = `<div class="grid">
      <div class="seg" id="segAdm">${Object.entries(tabs).map(([k, v]) => `<button data-t="${k}" class="${st.adminTab === k ? "on" : ""}">${v}</button>`).join("")}</div>
      <div id="admBody" class="grid"></div></div>`;
    $("segAdm").querySelectorAll("button").forEach(b => b.onclick = () => { st.adminTab = b.dataset.t; render(); });
    ({ empleados: admEmpleados, cambios: admCambios, avisos: admAvisos, planillas: admPlanillas, personas: admPersonas })[st.adminTab]($("admBody"));
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
    root.innerHTML = `<div class="card"><h3>Cargar cambio o franco</h3>
        <div class="field"><label>Persona</label><select class="in" id="cbPer">${opcionesPersonas(st.ver)}</select></div>
        <div class="row"><div class="field f"><label>Desde</label><input type="date" class="in" id="cbFec" value="${ymd(st.fecha)}"></div>
          <div class="field f"><label>Hasta (opcional)</label><input type="date" class="in" id="cbHasta"></div></div>
        <div class="field"><label>Ese día</label><div class="seg" id="cbTipo"><button class="on" data-t="1">Trabaja</button><button data-t="0">Franco</button></div></div>
        <div class="field" id="cbHoraF"><label>Horario</label><input class="in" id="cbHora" placeholder="Ej: 8 a 16  ·  o  9 a 13 · 18 a 22"></div>
        <div class="field"><label>Nota (la ve el empleado)</label><input class="in" id="cbNota" placeholder="Ej: cubre a Rojas"></div>
        <div class="muted" id="cbPrev" style="margin-bottom:8px"></div>
        <button class="btn pri" id="cbOk">Guardar cambio</button>
      </div>
      <div class="card"><h3>Cambios cargados <span class="sp"></span><span class="muted">últimos 30 días y futuros</span></h3><div class="list">${lista.length ? lista.map(c => `
        <div class="it"><span class="dot" style="background:${c.t ? "var(--acc)" : "var(--bad)"}"></span><div class="grow"><b>${esc(c.persona)}</b> · ${DIAS[parseYMD(c.fecha).getDay()]} ${corto(parseYMD(c.fecha))}
          <div class="muted">${c.t ? "Trabaja " + esc(c.h || "") : "Franco"}${c.nota ? " · " + esc(c.nota) : ""} · por ${esc(c.por || "")}</div></div>
          <button class="btn sm bad" data-del="${esc(c.id)}">Quitar</button></div>`).join("") : `<div class="empty">No hay cambios cargados.</div>`}</div></div>`;
    let tipo = 1;
    const prev = () => {
      const p = $("cbPer").value, d = $("cbFec").value ? parseYMD($("cbFec").value) : null;
      if (!d) return $("cbPrev").textContent = "";
      const s = estado(p, d);
      $("cbPrev").textContent = s ? `Según la planilla, el ${corto(d)} ${p} tiene: ${s.h}${s.cambio ? " (ya tiene un cambio cargado)" : ""}.` : "";
      if (tipo && !$("cbHora").value && s && s.trabaja && s.h !== "Horario a confirmar") $("cbHora").placeholder = "Ej: " + s.h;
    };
    $("cbTipo").querySelectorAll("button").forEach(b => b.onclick = () => { tipo = +b.dataset.t; $("cbTipo").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); $("cbHoraF").classList.toggle("oculto", !tipo); });
    $("cbPer").onchange = prev; $("cbFec").onchange = prev; prev();
    $("cbOk").onclick = async () => {
      const persona = $("cbPer").value, f1 = $("cbFec").value, f2 = $("cbHasta").value || f1;
      if (!f1) return toast("Elegí la fecha");
      if (f2 < f1) return toast("La fecha 'hasta' es anterior a 'desde'");
      const h = $("cbHora").value.trim();
      if (tipo && h && L.minutos(h) === null) return toast("Escribí el horario como '8 a 16' o '9 a 13 · 18 a 22'");
      const dias = []; for (let x = parseYMD(f1); ymd(x) <= f2 && dias.length < 62; x = addDays(x, 1)) dias.push(ymd(x));
      try {
        for (const fecha of dias) await B.guardarCambio({ persona, fecha, t: !!tipo, h: tipo ? h : "", nota: $("cbNota").value.trim(), por: st.user.usuario });
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
    const D = L.getData();
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
    const e = st.ed, D = L.getData();
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

  function admPersonas(root) {
    const D = L.getData(), ps = L.personas();
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

  /* ============================== INICIO ============================== */
  B.init().catch(e => { console.error(e); mostrarLogin("No se pudo conectar: " + e.message); });
})();
