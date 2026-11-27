// Acciones que puede proponer el asistente de IA (y que el administrador confirma).
// El servidor las usa para validar y describir la propuesta; la app, para aplicarla.
// aplicar(datos, accion) -> { datos (planillas nuevas o null), ops (operaciones sobre
// cambios / avisos / empleados), descripcion, advertencias }   o lanza Error con el motivo.
(function (G) {
  const L = G.L;
  const A = {};
  const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const corto = d => `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
  const clon = x => JSON.parse(JSON.stringify(x));
  const falla = m => { throw new Error(m); };
  A.PLANILLAS = ["semana", "A_sab", "A_dom", "B_sab", "B_dom", "feriado"];
  const NOMBRE_PLANILLA = { semana: "semanal (lunes a viernes)", A_sab: "Grupo A sábado", A_dom: "Grupo A domingo", B_sab: "Grupo B sábado", B_dom: "Grupo B domingo", feriado: "de feriado" };

  /* ---------- personas ---------- */
  A.todasLasPersonas = D => {
    const s = new Set();
    D.SECTORES.forEach(x => x.personas.forEach(p => s.add(p.n)));
    ["A", "B"].forEach(g => ["sab", "dom"].forEach(d => (D.FINDE[g][d] || []).forEach(r => s.add(r[1]))));
    (D.FERIADO_PLANILLA.B.lista || []).forEach(r => s.add(r[1]));
    return [...s];
  };
  // "pacheco", "Julian Pacheco" o "Pacheco Julian" -> "Pacheco Julian"
  A.resolverPersona = (nombre, lista) => {
    const q = L.norm(String(nombre || "")); if (!q) falla("Falta el nombre de la persona.");
    const exacta = lista.find(n => L.norm(n) === q); if (exacta) return exacta;
    const tq = q.split(" ");
    const cand = lista.filter(n => { const tn = L.norm(n).split(" "); return tq.every(t => tn.some(x => x === t || (t.length >= 4 && x.startsWith(t)))); });
    if (cand.length === 1) return cand[0];
    if (cand.length > 1) falla(`"${nombre}" coincide con varias personas: ${cand.join(", ")}. Indicá cuál.`);
    const parecidas = lista.map(n => ({ n, p: L.norm(n).split(" ").filter(x => tq.some(t => x.startsWith(t.slice(0, 3)))).length })).filter(x => x.p).sort((a, b) => b.p - a.p).slice(0, 4).map(x => x.n);
    falla(`No encontré a "${nombre}" en las planillas.${parecidas.length ? " ¿Quisiste decir " + parecidas.join(", ") + "?" : ""}`);
  };

  /* ---------- horarios ---------- */
  // "07:00-15:00", "7hs a 15hs", "de 9 a 13 y de 18 a 22" -> "7 a 15", "9 a 13 · 18 a 22"
  A.normHorario = h => {
    let s = String(h || "").toLowerCase().trim();
    if (!s) falla("Falta el horario.");
    if (/^sin horario/.test(s)) return "Sin horario semanal";
    s = s.replace(/h(oras|s|rs)?\.?/g, " ").replace(/\bde\b/g, " ").replace(/\s+/g, " ");
    const partes = s.split(/\s*(?:·|\by\b|,|\+|\/|;|\be\b)\s*/).filter(Boolean);
    const out = partes.map(p => {
      const m = p.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(?:a|-|–|al|hasta)\s*(\d{1,2})(?:[:.](\d{2}))?/);
      if (!m) falla(`No entiendo el horario "${h}". Usá por ejemplo "7 a 15" o "9 a 13 · 18 a 22".`);
      const f = (hh, mm) => {
        const H = +hh, M = +(mm || 0);
        if (H > 24 || M > 59) falla(`Hora inválida en "${h}".`);
        const hs = H === 24 ? "00" : (hh.length === 2 && hh[0] === "0") ? hh : String(H);
        return hs + (M ? ":" + String(M).padStart(2, "0") : "");
      };
      return `${f(m[1], m[2])} a ${f(m[3], m[4])}`;
    });
    const r = out.join(" · ");
    if (L.minutos(r) === null) falla(`Horario inválido: "${h}".`);
    return r;
  };
  const fecha = (s, campo) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) falla(`La fecha ${campo || ""} tiene que tener el formato AAAA-MM-DD.`);
    const d = L.parseYMD(s); if (isNaN(d) || L.ymd(d) !== s) falla(`Fecha inválida: ${s}.`); return d;
  };

  /* ---------- planillas como filas ---------- */
  A.filas = (D, plan) => {
    if (plan === "semana") { const r = []; D.SECTORES.forEach(s => s.personas.forEach(p => r.push({ sector: s.nombre, n: p.n, h: p.h, fijo: !!p.fijo }))); return r; }
    if (plan === "feriado") return D.FERIADO_PLANILLA.B.lista.map(x => ({ sector: x[0], n: x[1], h: x[2], fijo: !!x[3] }));
    const [g, d] = plan.split("_"); if (!D.FINDE[g] || !D.FINDE[g][d]) falla(`Planilla desconocida: ${plan}.`);
    return D.FINDE[g][d].map(x => ({ sector: x[0], n: x[1], h: x[2], fijo: !!x[3] }));
  };
  const sectoresDe = filas => { const o = []; filas.forEach(r => { if (!o.includes(r.sector)) o.push(r.sector); }); return o; };
  A.fechaBase = (D, plan) => plan === "semana" ? D.BASE_LUNES : plan === "feriado" ? D.FERIADO_BASE : L.ymd(L.baseGrupo(plan[0]));
  function guardarFilas(D, plan, filas, fechaBase, obs) {
    const vistos = new Set();
    filas.forEach(r => {
      if (!r.n || !r.sector) falla("Cada fila necesita persona y sector.");
      if (vistos.has(L.norm(r.n))) falla(`${r.n} está repetido en la planilla ${NOMBRE_PLANILLA[plan]}.`); vistos.add(L.norm(r.n));
      if (r.h === "Sin horario semanal" && plan !== "semana") falla(`${r.n} necesita un horario.`);
    });
    if (fechaBase) {
      const f = fecha(fechaBase, "de la planilla");
      if (plan === "semana" && f.getDay() !== 1) falla("La fecha de la planilla semanal tiene que ser un lunes.");
      if (plan.includes("_")) {
        if (f.getDay() !== 6) falla("La fecha de una planilla de finde tiene que ser un sábado.");
        if (L.grupoFinde(f) !== plan[0]) falla(`El sábado ${fechaBase} trabaja el Grupo ${L.grupoFinde(f)}, no el ${plan[0]}.`);
      }
      if (plan === "feriado" && !L.feriadoAlterna(f)) falla(`${fechaBase} no es un feriado de lunes a viernes.`);
    }
    if (plan === "semana") {
      D.SECTORES = sectoresDe(filas).map(s => ({ nombre: s, personas: filas.filter(r => r.sector === s).map(r => r.fijo ? { n: r.n, h: r.h, fijo: true } : { n: r.n, h: r.h }) }));
      if (fechaBase) D.BASE_LUNES = fechaBase;
    } else {
      const lista = filas.map(r => r.fijo ? [r.sector, r.n, r.h, 1] : [r.sector, r.n, r.h]);
      if (plan === "feriado") {
        D.FERIADO_PLANILLA.B.lista = lista;
        if (fechaBase) { const f = L.parseYMD(fechaBase); D.FERIADO_BASE = fechaBase; D.FERIADO_PLANILLA.B.ref = `${corto(f)} ${f.getFullYear()}`; }
      } else {
        const [g, d] = plan.split("_");
        D.FINDE[g][d] = lista;
        if (fechaBase) { const f = L.parseYMD(fechaBase); D.FINDE[g].base = fechaBase; D.FINDE[g].ref = `${f.getDate()} y ${L.addDays(f, 1).getDate()} ${MESES[f.getMonth()]} ${f.getFullYear()}`; }
        if (obs !== undefined) D.FINDE[g].obs = obs;
      }
    }
  }

  /* ---------- acciones ---------- */
  const H = {};

  // Cambio de turno o franco para uno o varios días (el empleado lo aprueba en su teléfono).
  H.cambio_turno = (D, a) => {
    const persona = A.resolverPersona(a.persona, A.todasLasPersonas(D));
    const d1 = fecha(a.desde, "desde"), d2 = a.hasta ? fecha(a.hasta, "hasta") : d1;
    if (d2 < d1) falla("La fecha 'hasta' es anterior a 'desde'.");
    const dias = L.dias(d1, d2) + 1; if (dias > 62) falla("Como máximo 62 días por cambio.");
    const trabaja = a.trabaja !== false;
    const h = trabaja ? (a.horario ? A.normHorario(a.horario) : "") : "";
    const lista = []; for (let i = 0; i < dias; i++) lista.push({ persona, fecha: L.ymd(L.addDays(d1, i)), t: trabaja, h, nota: String(a.nota || "").slice(0, 200) });
    const cuando = dias === 1 ? corto(d1) : `del ${corto(d1)} al ${corto(d2)}`;
    return { ops: [{ tipo: "cambios", lista }], descripcion: `${persona}: ${trabaja ? "trabaja" + (h ? " " + h : "") : "franco"} ${cuando}${a.nota ? ` (nota: ${a.nota})` : ""}. Le llega para aprobar.` };
  };
  H.cancelar_cambio = (D, a) => {
    const persona = A.resolverPersona(a.persona, A.todasLasPersonas(D));
    const d1 = fecha(a.desde, "desde"), d2 = a.hasta ? fecha(a.hasta, "hasta") : d1;
    return { ops: [{ tipo: "borrarCambios", persona, desde: L.ymd(d1), hasta: L.ymd(d2) }], descripcion: `Quitar los cambios cargados de ${persona} ${L.ymd(d1) === L.ymd(d2) ? "el " + corto(d1) : `del ${corto(d1)} al ${corto(d2)}`} (vuelve el horario de la planilla).` };
  };
  H.aviso = (D, a) => {
    const t = String(a.texto || "").trim(); if (!t) falla("El aviso está vacío."); if (t.length > 500) falla("El aviso es muy largo (máx. 500).");
    return { ops: [{ tipo: "aviso", texto: t }], descripcion: `Publicar aviso para todos: “${t}”` };
  };
  // Edición parcial de una planilla: lista de operaciones.
  H.editar_planilla = (D, a) => {
    const plan = a.planilla; if (!A.PLANILLAS.includes(plan)) falla(`Planilla inválida: ${plan}. Opciones: ${A.PLANILLAS.join(", ")}.`);
    let filas = A.filas(D, plan);
    const nombres = () => filas.map(r => r.n);
    const desc = [];
    (a.operaciones || []).forEach(o => {
      const idx = () => { const n = A.resolverPersona(o.persona, nombres()); return filas.findIndex(r => r.n === n); };
      switch (o.op) {
        case "horario": { const i = idx(); const h = A.normHorario(o.horario); desc.push(`${filas[i].n}: ${filas[i].h} → ${h}`); filas[i].h = h; break; }
        case "agregar": {
          if (!o.sector) falla("Para agregar a alguien indicá el sector.");
          if (filas.some(r => L.norm(r.n) === L.norm(o.persona))) falla(`${o.persona} ya está en la planilla.`);
          const sector = sectoresDe(filas).find(s => L.norm(s) === L.norm(o.sector)) || o.sector;
          const fila = { sector, n: String(o.persona).trim(), h: A.normHorario(o.horario), fijo: !!o.fijo };
          const delSector = filas.map((r, k) => k).filter(k => filas[k].sector === sector);
          const pos = o.posicion ? Math.max(1, Math.min(+o.posicion, delSector.length + 1)) : delSector.length + 1;
          const at = delSector.length ? (pos > delSector.length ? delSector[delSector.length - 1] + 1 : delSector[pos - 1]) : filas.length;
          filas.splice(at, 0, fila);
          desc.push(`Agregar a ${fila.n} en ${sector} (${fila.h}${fila.fijo ? ", fijo" : ""})`); break;
        }
        case "quitar": { const i = idx(); desc.push(`Quitar a ${filas[i].n}`); filas.splice(i, 1); break; }
        case "fijo": { const i = idx(); filas[i].fijo = !!o.fijo; desc.push(`${filas[i].n}: ${o.fijo ? "horario fijo (negrita, no rota)" : "entra en la rotación"}`); break; }
        case "mover": {
          const i = idx(); const r = filas.splice(i, 1)[0];
          if (o.sector) r.sector = sectoresDe(filas.concat([r])).find(s => L.norm(s) === L.norm(o.sector)) || o.sector;
          const delSector = filas.map((x, k) => k).filter(k => filas[k].sector === r.sector);
          const pos = o.posicion ? Math.max(1, Math.min(+o.posicion, delSector.length + 1)) : delSector.length + 1;
          const at = delSector.length ? (pos > delSector.length ? delSector[delSector.length - 1] + 1 : delSector[pos - 1]) : filas.length;
          filas.splice(at, 0, r); desc.push(`Mover a ${r.n} a ${r.sector}, puesto ${pos}`); break;
        }
        case "renombrar_sector": {
          const s = sectoresDe(filas).find(x => L.norm(x) === L.norm(o.sector)); if (!s) falla(`No existe el sector "${o.sector}".`);
          filas.forEach(r => { if (r.sector === s) r.sector = o.nuevo; }); desc.push(`Sector ${s} → ${o.nuevo}`); break;
        }
        default: falla(`Operación desconocida: ${o.op}.`);
      }
    });
    if (a.fecha_base) desc.push(`Fecha de la planilla: ${a.fecha_base}`);
    if (a.observaciones !== undefined) desc.push(`Observaciones: “${a.observaciones}”`);
    if (!desc.length) falla("No hay cambios para hacer en la planilla.");
    const N = clon(D); guardarFilas(N, plan, filas, a.fecha_base, a.observaciones);
    return { datos: N, ops: [], descripcion: `Planilla ${NOMBRE_PLANILLA[plan]}: ${desc.join("; ")}.` };
  };
  // Reemplazo total de una planilla (por ejemplo, la planilla nueva de la semana).
  H.reemplazar_planilla = (D, a) => {
    const plan = a.planilla; if (!A.PLANILLAS.includes(plan)) falla(`Planilla inválida: ${plan}.`);
    if (!Array.isArray(a.filas) || !a.filas.length) falla("La planilla nueva no tiene filas.");
    if (!a.fecha_base) falla("Indicá la fecha de la planilla nueva (lunes de esa semana, sábado del finde o fecha del feriado).");
    const filas = a.filas.map(r => ({ sector: String(r.sector || "").trim(), n: String(r.persona || "").trim(), h: A.normHorario(r.horario), fijo: !!r.fijo }));
    const N = clon(D); guardarFilas(N, plan, filas, a.fecha_base, a.observaciones);
    const antes = new Set(A.filas(D, plan).map(r => L.norm(r.n))), ahora = new Set(filas.map(r => L.norm(r.n)));
    const nuevos = filas.filter(r => !antes.has(L.norm(r.n))).map(r => r.n), salen = A.filas(D, plan).filter(r => !ahora.has(L.norm(r.n))).map(r => r.n);
    const adv = [];
    if (nuevos.length) adv.push("Personas nuevas: " + nuevos.join(", "));
    if (salen.length) adv.push("Ya no figuran: " + salen.join(", "));
    return { datos: N, ops: [], advertencias: adv, descripcion: `Reemplazar la planilla ${NOMBRE_PLANILLA[plan]} desde ${a.fecha_base} (${filas.length} personas en ${sectoresDe(filas).length} sectores).${adv.length ? " " + adv.join(". ") + "." : ""}` };
  };
  H.renombrar_persona = (D, a) => {
    const actual = A.resolverPersona(a.actual, A.todasLasPersonas(D)), nuevo = String(a.nuevo || "").trim();
    if (!nuevo) falla("Falta el nombre nuevo.");
    const N = clon(D), k = L.norm(actual);
    N.SECTORES.forEach(s => s.personas.forEach(p => { if (L.norm(p.n) === k) p.n = nuevo; }));
    ["A", "B"].forEach(g => ["sab", "dom"].forEach(d => N.FINDE[g][d].forEach(r => { if (L.norm(r[1]) === k) r[1] = nuevo; })));
    N.FERIADO_PLANILLA.B.lista.forEach(r => { if (L.norm(r[1]) === k) r[1] = nuevo; });
    [N.GRUPO_FIJO, N.TRABAJO_FERIADO_BASE].forEach(o => { if (o && actual in o) { o[nuevo] = o[actual]; delete o[actual]; } });
    return { datos: N, ops: [{ tipo: "reasignarEmpleado", de: actual, a: nuevo }], descripcion: `Renombrar a ${actual} como “${nuevo}” en todas las planillas (y en su cuenta si está registrada).` };
  };
  H.grupo_persona = (D, a) => {
    const persona = A.resolverPersona(a.persona, A.todasLasPersonas(D));
    const N = clon(D); N.GRUPO_FIJO = N.GRUPO_FIJO || {}; N.TRABAJO_FERIADO_BASE = N.TRABAJO_FERIADO_BASE || {};
    const d = [];
    if (a.grupo_finde) {
      const g = { A: "A", B: "B", AB: "AB", ninguno: "", auto: null }[a.grupo_finde]; if (g === undefined) falla("grupo_finde: A, B, AB, ninguno o auto.");
      if (g === null) delete N.GRUPO_FIJO[persona]; else N.GRUPO_FIJO[persona] = g;
      d.push(g === null ? "grupo de finde según planilla" : g ? `trabaja findes del Grupo ${g === "AB" ? "A y B" : g}` : "no trabaja findes");
    }
    if (a.feriado_base) {
      const v = { trabajo: true, descanso: false, auto: null }[a.feriado_base]; if (v === undefined) falla("feriado_base: trabajo, descanso o auto.");
      if (v === null) delete N.TRABAJO_FERIADO_BASE[persona]; else N.TRABAJO_FERIADO_BASE[persona] = v;
      d.push(v === null ? "feriados según planilla" : `en el feriado de referencia (${D.FERIADO_BASE}) ${v ? "trabajó" : "descansó"}`);
    }
    if (!d.length) falla("Indicá grupo_finde y/o feriado_base.");
    return { datos: N, ops: [], descripcion: `${persona}: ${d.join("; ")}.` };
  };
  H.feriado = (D, a) => {
    const f = fecha(a.fecha, "del feriado"), k = L.ymd(f), y = String(f.getFullYear());
    const N = clon(D); N.PUENTES = N.PUENTES || {}; N.FERIADOS_EXTRA = N.FERIADOS_EXTRA || {}; N.FERIADOS_QUITAR = N.FERIADOS_QUITAR || [];
    const sacar = () => { if (N.PUENTES[y]) N.PUENTES[y] = N.PUENTES[y].filter(x => x !== k); delete N.FERIADOS_EXTRA[k]; N.FERIADOS_QUITAR = N.FERIADOS_QUITAR.filter(x => x !== k); };
    sacar();
    if (a.tipo === "puente") (N.PUENTES[y] = N.PUENTES[y] || []).push(k);
    else if (a.tipo === "feriado") N.FERIADOS_EXTRA[k] = String(a.nombre || "Feriado");
    else if (a.tipo === "quitar") N.FERIADOS_QUITAR.push(k);
    else if (a.tipo !== "restaurar") falla("tipo: puente, feriado, quitar o restaurar.");
    const txt = { puente: "día no laborable (puente, se trabaja normal)", feriado: `feriado “${a.nombre || "Feriado"}”`, quitar: "ya no es feriado", restaurar: "vuelve al calendario oficial" }[a.tipo];
    return { datos: N, ops: [], descripcion: `${corto(f)} ${f.getFullYear()}: ${txt}.` };
  };
  H.invertir_grupos = D => {
    const N = clon(D); N.FINDE_BASE_GRUPO = L.otro(N.FINDE_BASE_GRUPO);
    const a = N.FINDE.A.base, b = N.FINDE.B.base; N.FINDE.A.base = b; N.FINDE.B.base = a;
    return { datos: N, ops: [], descripcion: "Invertir qué grupo trabaja cada fin de semana." };
  };
  H.borrar_empleado = (D, a, ctx) => {
    const lista = (ctx && ctx.empleados || []).map(e => e.persona);
    const persona = A.resolverPersona(a.persona, lista.length ? lista : A.todasLasPersonas(D));
    return { ops: [{ tipo: "borrarEmpleado", persona }], descripcion: `Dar de baja la cuenta de ${persona} (tendrá que registrarse de nuevo).` };
  };

  A.TIPOS = Object.keys(H);
  A.aplicar = (datos, accion, ctx) => {
    const f = H[accion && accion.tipo]; if (!f) falla(`Acción desconocida: ${accion && accion.tipo}.`);
    const prev = L.getData();
    try {
      L.setData(datos);
      const r = f(datos, accion.datos || {}, ctx || {});
      return { datos: r.datos || null, ops: r.ops || [], descripcion: r.descripcion, advertencias: r.advertencias || [] };
    } finally { L.setData(prev); }
  };
  G.Acciones = A;
})(typeof window !== "undefined" ? window : globalThis);
