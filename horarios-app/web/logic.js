// Lógica de cálculo de horarios. Sin dependencias de la pantalla (se prueba con node).
(function (G) {
  const DAY = 864e5;
  const L = {};

  // Reemplaza los datos (planillas) en uso, p. ej. cuando un administrador los edita.
  L.setData = d => { Object.keys(d).forEach(k => { G[k] = d[k]; }); Object.keys(cache).forEach(k => delete cache[k]); memo.personas = null; memo.feriadoK.clear(); memo.ubicar.clear(); };
  // Lectura directa (sin copiar) de las planillas en uso: para leer, no para modificar.
  L.datos = () => ({ BASE_LUNES: G.BASE_LUNES, SECTORES: G.SECTORES, FINDE_BASE_SABADO: G.FINDE_BASE_SABADO, FINDE_BASE_GRUPO: G.FINDE_BASE_GRUPO,
    GRUPO_FIJO: G.GRUPO_FIJO, FINDE: G.FINDE, FERIADO_PLANILLA: G.FERIADO_PLANILLA, FERIADO_BASE: G.FERIADO_BASE,
    TRABAJO_FERIADO_BASE: G.TRABAJO_FERIADO_BASE, PUENTES: G.PUENTES, FERIADOS_EXTRA: G.FERIADOS_EXTRA, FERIADOS_QUITAR: G.FERIADOS_QUITAR });
  // resultados que se repiten mucho (se borran cuando cambian las planillas)
  const memo = { personas: null, feriadoK: new Map(), ubicar: new Map(), norm: new Map() };
  L.getData = () => JSON.parse(JSON.stringify({
    BASE_LUNES: G.BASE_LUNES, SECTORES: G.SECTORES, FINDE_BASE_SABADO: G.FINDE_BASE_SABADO, FINDE_BASE_GRUPO: G.FINDE_BASE_GRUPO,
    GRUPO_FIJO: G.GRUPO_FIJO, FINDE: G.FINDE, FERIADO_PLANILLA: G.FERIADO_PLANILLA, FERIADO_BASE: G.FERIADO_BASE,
    TRABAJO_FERIADO_BASE: G.TRABAJO_FERIADO_BASE, PUENTES: G.PUENTES, FERIADOS_EXTRA: G.FERIADOS_EXTRA, FERIADOS_QUITAR: G.FERIADOS_QUITAR }));

  /* ---------- horas ---------- */
  // "7:30 a 12 · 17:30 a 21" -> minutos totales (cruza medianoche si corresponde)
  L.minutos = h => {
    let tot = 0, ok = false;
    String(h || "").split("·").forEach(t => {
      const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(?:hs)?\s*a\s*(\d{1,2})(?::(\d{2}))?/i);
      if (!m) return;
      const a = (+m[1]) * 60 + (+(m[2] || 0)); let b = (+m[3]) * 60 + (+(m[4] || 0));
      if (b <= a) b += 1440;
      tot += b - a; ok = true;
    });
    return ok ? tot : null;
  };
  L.fmtHoras = min => { const h = Math.floor(min / 60), m = min % 60; return h + (m ? ":" + String(m).padStart(2, "0") : "") + " h"; };
  const cache = {};

  /* ---------- fechas ---------- */
  L.parseYMD = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  L.ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  L.addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  L.lunesDe = d => L.addDays(d, -((d.getDay() + 6) % 7));
  L.mod = (a, n) => ((a % n) + n) % n;
  // diferencia en días calendario, inmune a cambios de horario
  L.dias = (a, b) => Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY);
  L.norm = s => {
    let r = memo.norm.get(s);
    if (r === undefined) { r = String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim(); if (memo.norm.size > 5000) memo.norm.clear(); memo.norm.set(s, r); }
    return r;
  };
  L.finde = d => d.getDay() === 0 || d.getDay() === 6;

  /* ---------- feriados de Argentina (Ley 27.399) ---------- */
  L.pascua = y => { // algoritmo de Meeus/Jones/Butcher
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, mes - 1, dia);
  };
  // Trasladables: martes/miércoles -> lunes anterior; jueves/viernes -> lunes siguiente.
  L.trasladar = d => { const w = d.getDay(); return w === 2 || w === 3 ? L.addDays(d, 1 - w) : w === 4 || w === 5 ? L.addDays(d, 8 - w) : d; };
  L.feriadosAnio = y => {
    if (cache[y]) return cache[y];
    const r = {}, put = (d, n, t) => { r[L.ymd(d)] = { nombre: n, tipo: t || "feriado" }; };
    const f = (m, d) => new Date(y, m - 1, d);
    put(f(1, 1), "Año Nuevo");
    const p = L.pascua(y);
    put(L.addDays(p, -48), "Carnaval"); put(L.addDays(p, -47), "Carnaval");
    put(f(3, 24), "Día de la Memoria");
    put(f(4, 2), "Día de Malvinas");
    put(L.addDays(p, -2), "Viernes Santo");
    put(f(5, 1), "Día del Trabajador");
    put(f(5, 25), "Revolución de Mayo");
    put(L.trasladar(f(6, 17)), "Paso a la Inmortalidad de Güemes");
    put(f(6, 20), "Día de la Bandera");
    put(f(7, 9), "Día de la Independencia");
    put(L.trasladar(f(8, 17)), "Paso a la Inmortalidad de San Martín");
    put(L.trasladar(f(10, 12)), "Día de la Diversidad Cultural");
    put(L.trasladar(f(11, 20)), "Día de la Soberanía Nacional");
    put(f(12, 8), "Inmaculada Concepción de María");
    put(f(12, 25), "Navidad");
    ((G.PUENTES || {})[y] || []).forEach(s => { if (!r[s]) r[s] = { nombre: "Día no laborable (puente turístico)", tipo: "puente" }; });
    Object.entries(G.FERIADOS_EXTRA || {}).forEach(([s, n]) => { if (s.startsWith(y + "-")) r[s] = { nombre: n, tipo: "feriado" }; });
    (G.FERIADOS_QUITAR || []).forEach(s => delete r[s]);
    return (cache[y] = r);
  };
  L.feriado = d => L.feriadosAnio(d.getFullYear())[L.ymd(d)] || null;
  L.feriadoAlterna = d => { const f = L.feriado(d); return !!f && f.tipo === "feriado" && !L.finde(d); };
  // Índice de un feriado de lunes a viernes contando desde el de referencia (0 = 23-11-26).
  L.feriadoK = d => {
    const clave = L.ymd(d);
    if (memo.feriadoK.has(clave)) return memo.feriadoK.get(clave);
    const v = feriadoKCalc(d); memo.feriadoK.set(clave, v); return v;
  };
  const feriadoKCalc = d => {
    const base = L.parseYMD(G.FERIADO_BASE);
    const contar = (y) => Object.keys(L.feriadosAnio(y)).sort().filter(s => L.feriadoAlterna(L.parseYMD(s)));
    let k = 0;
    if (d >= base) {
      for (let y = base.getFullYear(); y <= d.getFullYear(); y++)
        contar(y).forEach(s => { const x = L.parseYMD(s); if (x > base && x <= d) k++; });
    } else {
      for (let y = d.getFullYear(); y <= base.getFullYear(); y++)
        contar(y).forEach(s => { const x = L.parseYMD(s); if (x >= d && x < base) k--; });
    }
    return k;
  };

  /* ---------- semana (lunes a viernes) ---------- */
  L.semanaK = d => Math.round(L.dias(L.parseYMD(G.BASE_LUNES), L.lunesDe(d)) / 7);
  L.horariosSector = (sec, k) => {
    const rot = sec.personas.filter(p => !p.fijo), n = rot.length;
    return sec.personas.map(p => (p.fijo || !n) ? { ...p, actual: p.h } : { ...p, actual: rot[L.mod(rot.indexOf(p) + k, n)].h });
  };

  /* ---------- listas de finde / feriado con rotación ---------- */
  // filas: [sector, nombre, horario, fijo?]. Rota dentro de cada sector.
  L.rotarLista = (lista, k) => {
    const porSec = {};
    lista.forEach(r => (porSec[r[0]] = porSec[r[0]] || []).push(r));
    return lista.map(r => {
      if (r[3]) return { sector: r[0], n: r[1], h: r[2], fijo: true };
      const rot = porSec[r[0]].filter(x => !x[3]);
      return { sector: r[0], n: r[1], h: rot[L.mod(rot.indexOf(r) + k, rot.length)][2], fijo: false };
    });
  };
  L.otro = g => g === "A" ? "B" : "A";
  L.sabadoDelFinde = d => d.getDay() === 6 ? d : L.addDays(d, -1);
  L.grupoFinde = sab => {
    const w = Math.round(L.dias(L.parseYMD(G.FINDE_BASE_SABADO), sab) / 7);
    return L.mod(w, 2) === 0 ? G.FINDE_BASE_GRUPO : L.otro(G.FINDE_BASE_GRUPO);
  };
  // sábado de la planilla de referencia de cada grupo
  L.baseGrupo = g => G.FINDE[g].base ? L.parseYMD(G.FINDE[g].base)
    : L.addDays(L.parseYMD(G.FINDE_BASE_SABADO), g === G.FINDE_BASE_GRUPO ? 0 : 7);
  // cuántas veces trabajó ese grupo desde su planilla de referencia
  L.findeK = (sab, g) => Math.round(L.dias(L.baseGrupo(g || L.grupoFinde(sab)), sab) / 14);
  L.listaFinde = d => {
    const sab = L.sabadoDelFinde(d), g = L.grupoFinde(sab), k = L.findeK(sab, g);
    return { grupo: g, k, lista: L.rotarLista(G.FINDE[g][d.getDay() === 6 ? "sab" : "dom"], k) };
  };
  // El equipo del 23-11 trabaja los feriados pares; su planilla rota una vez por cada feriado que trabaja.
  L.listaFeriado = d => {
    const k = L.feriadoK(d);
    if (L.mod(k, 2) !== 0) return null;
    return L.rotarLista(G.FERIADO_PLANILLA.B.lista, k / 2);
  };

  const buscar = (lista, nombre) => (lista || []).find(r => L.norm(r.n || r[1]) === L.norm(nombre));
  L.buscar = buscar;

  L.grupoAuto = nombre => (G.GRUPO_FIJO && nombre in G.GRUPO_FIJO) ? G.GRUPO_FIJO[nombre] : L.grupoPlanilla(nombre);
  // grupo según las planillas, sin ajustes manuales
  L.grupoPlanilla = nombre => {
    const en = g => buscar(G.FINDE[g].sab, nombre) || buscar(G.FINDE[g].dom, nombre);
    return en("A") && en("B") ? "AB" : en("A") ? "A" : en("B") ? "B" : "";
  };
  L.trabajoFeriadoBaseAuto = nombre => (G.TRABAJO_FERIADO_BASE && nombre in G.TRABAJO_FERIADO_BASE)
    ? !!G.TRABAJO_FERIADO_BASE[nombre] : L.feriadoPlanilla(nombre);
  L.feriadoPlanilla = nombre => !!buscar(G.FERIADO_PLANILLA.B.lista, nombre);
  // lista de todas las personas de la planilla semanal
  L.personas = () => {
    if (!memo.personas) { const r = []; G.SECTORES.forEach((s, si) => s.personas.forEach((p, pi) => r.push({ n: p.n, sector: s.nombre, si, pi }))); memo.personas = r; }
    return memo.personas.slice();
  };
  L.ubicar = nombre => {
    const k = L.norm(nombre);
    if (!memo.ubicar.has(k)) memo.ubicar.set(k, L.personas().find(x => L.norm(x.n) === k) || null);
    return memo.ubicar.get(k);
  };

  /* ---------- qué le toca a una persona un día ----------
     pref = { grupo: "A"|"B"|"AB"|""|undefined, ferBase: true|false|undefined, manual: {t,h}|undefined } */
  L.estadoDia = (sec, pi, d, pref) => {
    pref = pref || {};
    const p = sec.personas[pi];
    const fer = L.feriado(d);
    const grupo = pref.grupo !== undefined ? pref.grupo : L.grupoAuto(p.n);
    let r;
    if (L.finde(d)) {
      const { grupo: g, lista } = L.listaFinde(d);
      const e = buscar(lista, p.n);
      if (e) r = { tipo: "finde", trabaja: true, h: e.h, grupo: g, fijo: e.fijo };
      else if (grupo.includes(g)) r = { tipo: "finde", trabaja: true, h: "Horario a confirmar", grupo: g };
      else r = { tipo: "finde", trabaja: false, h: "Franco", grupo: g };
    } else if (fer && fer.tipo === "feriado") {
      const k = L.feriadoK(d);
      const base = pref.ferBase !== undefined ? pref.ferBase : L.trabajoFeriadoBaseAuto(p.n);
      const trabaja = (L.mod(k, 2) === 0) === base;
      const lista = L.listaFeriado(d);
      const e = lista && buscar(lista, p.n);
      r = trabaja ? { tipo: "feriado", trabaja: true, h: e ? e.h : "Horario a confirmar", k }
                  : { tipo: "feriado", trabaja: false, h: "Franco", k };
    } else {
      const h = L.horariosSector(sec, L.semanaK(d))[pi].actual;
      const sin = /^Sin horario/.test(h);
      r = { tipo: "semana", trabaja: !sin, h: sin ? "Franco" : h };
    }
    r.feriado = fer;
    if (pref.manual) { r.manual = true; r.trabaja = pref.manual.t; r.h = pref.manual.t ? (pref.manual.h || "Trabajo") : "Franco"; }
    return r;
  };

  G.L = L;
})(typeof window !== "undefined" ? window : globalThis);
