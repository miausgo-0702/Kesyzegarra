// Pruebas de la lógica: node horarios-app/test/logic.test.js
const fs = require("fs"), path = require("path"), vm = require("vm"), assert = require("assert");
const dir = path.join(__dirname, "../web");
const ctx = { window: {} }; ctx.globalThis = ctx.window; vm.createContext(ctx.window);
ctx.window.window = ctx.window;
for (const f of ["data.js", "logic.js"]) vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx.window);
const W = ctx.window, L = W.L, D = L.parseYMD, D_ = L.parseYMD;
let ok = 0; const t = (name, fn) => { fn(); ok++; };
const sec = n => W.SECTORES.find(s => s.nombre === n);
const idx = (s, n) => s.personas.findIndex(p => p.n === n);
const est = (secN, n, f, pref) => { const s = sec(secN); return L.estadoDia(s, idx(s, n), D(f), pref); };

// --- Feriados (Ley 27.399 + Resolución 164/2025) ---
t("feriados 2026 exactos", () => {
  const esperado = ["2026-01-01","2026-02-16","2026-02-17","2026-03-23","2026-03-24","2026-04-02","2026-04-03",
    "2026-05-01","2026-05-25","2026-06-15","2026-06-20","2026-07-09","2026-07-10","2026-08-17","2026-10-12",
    "2026-11-23","2026-12-07","2026-12-08","2026-12-25"];
  assert.deepStrictEqual(Object.keys(L.feriadosAnio(2026)).sort(), esperado);
  assert.strictEqual(L.feriado(D("2026-12-07")).tipo, "puente");
});
t("pascua", () => { assert.strictEqual(L.ymd(L.pascua(2026)), "2026-04-05"); assert.strictEqual(L.ymd(L.pascua(2027)), "2027-03-28"); assert.strictEqual(L.ymd(L.pascua(2028)), "2028-04-16"); });
t("feriados 2027 por regla", () => {
  const f = Object.keys(L.feriadosAnio(2027)).sort();
  ["2027-02-08","2027-02-09","2027-03-26","2027-06-21","2027-08-16","2027-10-11","2027-11-20"].forEach(x => assert(f.includes(x), x));
});

// --- Semana: rotación ---
t("Pacheco semana base (30/11) y siguiente", () => {
  assert.strictEqual(est("Ventas","Pacheco Julian","2026-12-02").h, "16:30 a 00:30");
  assert.strictEqual(est("Ventas","Pacheco Julian","2026-12-09").h, "10 a 13:30 · 20 a 00:30");   // toma el de Suárez
  assert.strictEqual(est("Ventas","Pacheco Julian","2026-11-25").h, "16 a 23");                   // semana anterior (hacia atrás)
});
t("el último pasa al primero, negrita fija", () => {
  assert.strictEqual(est("Ventas","Daverio Daniela","2026-12-09").h, "7 a 15");          // último -> primero (Carabajal)
  assert.strictEqual(est("Ventas","Ferreyra Sebastian","2027-03-03").h, "7 a 15");
  assert.strictEqual(est("Ventas","Banegas Fabian","2027-03-03").h, "8 a 16");
  assert.strictEqual(est("Ventas","Lugones Maximiliano","2027-03-03").h, "23 a 07");
});
t("vuelta completa (9 semanas) vuelve al mismo horario", () => {
  assert.strictEqual(est("Ventas","Pacheco Julian","2027-02-03").h, "16:30 a 00:30");
});
t("todos los horarios de la semana base coinciden con la planilla", () => {
  W.SECTORES.forEach(s => s.personas.forEach((p, i) => { if (!/^Sin/.test(p.h)) assert.strictEqual(L.estadoDia(s, i, D("2026-12-01")).h, p.h, p.n); }));
});
t("en cada semana nadie repite horario y no se pierde ninguno", () => {
  for (let w = 0; w < 30; w++) W.SECTORES.forEach(s => {
    const base = s.personas.map(p => p.h).sort(), sem = L.horariosSector(s, w).map(p => p.actual).sort();
    assert.deepStrictEqual(sem, base, s.nombre + " semana " + w);
  });
});

// --- Fines de semana ---
t("grupos alternados", () => {
  assert.strictEqual(L.grupoFinde(D("2026-11-14")), "B");
  assert.strictEqual(L.grupoFinde(D("2026-11-21")), "A");
  assert.strictEqual(L.grupoFinde(D("2026-11-28")), "B");
  assert.strictEqual(L.grupoFinde(D("2026-12-05")), "A");
});
t("planillas originales se reproducen", () => {
  assert.strictEqual(est("Ventas","Juan Renzo","2026-11-14").h, "10 a 14 · 19:30 a 00:30");
  assert.strictEqual(est("Ventas","Suarez Nahiara","2026-11-21").h, "14 a 23");
  assert.strictEqual(est("Ventas","Peralta Alejandro","2026-11-22").h, "17 a 01");
});
t("findes rotan un puesto cada vez que trabaja el grupo", () => {
  // B sábado ventas (sin Lugones): Zerda, Vallejos, Maguna, Juan Renzo, Daverio, Mitre
  assert.strictEqual(est("Ventas","Juan Renzo","2026-11-28").h, "14 a 22");          // toma el de Daverio
  assert.strictEqual(est("Ventas","Mitre Florencia","2026-11-28").h, "7 a 16");      // último -> primero
  assert.strictEqual(est("Ventas","Lugones Maximiliano","2026-11-28").h, "23 a 07"); // negrita fija
  assert.strictEqual(est("Ventas","Juan Renzo","2026-12-12").h, "16 a 01");
  assert.strictEqual(est("Ventas","Banegas Fabian","2026-12-05").h, "23 a 07");
  assert.strictEqual(est("Ventas","Suarez Nahiara","2026-12-05").h, "16 a 01");      // toma el de Peralta
});
t("Pacheco trabaja el finde 28/29 (grupo B) y no el 5/6", () => {
  assert(est("Ventas","Pacheco Julian","2026-11-28").trabaja);
  assert(est("Ventas","Pacheco Julian","2026-11-29").trabaja);
  assert(!est("Ventas","Pacheco Julian","2026-12-05").trabaja);
  assert(!est("Ventas","Pacheco Julian","2026-12-06").trabaja);
});

// --- Feriados: uno sí, uno no ---
t("Pacheco: descansó 23/11, trabaja 8/12, descansa 25/12, trabaja 1/1", () => {
  assert(!est("Ventas","Pacheco Julian","2026-11-23").trabaja);
  assert(est("Ventas","Pacheco Julian","2026-12-08").trabaja);
  assert(!est("Ventas","Pacheco Julian","2026-12-25").trabaja);
  assert(est("Ventas","Pacheco Julian","2027-01-01").trabaja);
});
t("puente 7/12 es día normal", () => {
  const r = est("Ventas","Pacheco Julian","2026-12-07");
  assert.strictEqual(r.tipo, "semana"); assert.strictEqual(r.h, "10 a 13:30 · 20 a 00:30");
});
t("equipo del 23/11: planilla original y luego alterna", () => {
  assert.strictEqual(est("Ventas","Juan Renzo","2026-11-23").h, "9:30 a 12:30 · 18:30 a 23:30");
  assert(!est("Ventas","Juan Renzo","2026-12-08").trabaja);
  assert(est("Ventas","Juan Renzo","2026-12-25").trabaja);
});
t("conteo de feriados entre años", () => {
  assert.strictEqual(L.feriadoK(D("2026-11-23")), 0);
  assert.strictEqual(L.feriadoK(D("2026-12-08")), 1);
  assert.strictEqual(L.feriadoK(D("2026-12-25")), 2);
  assert.strictEqual(L.feriadoK(D("2027-01-01")), 3);
  assert.strictEqual(L.feriadoK(D("2026-10-12")), -1);
});
t("feriado en finde sigue al grupo del finde", () => {
  const r = est("Ventas","Pacheco Julian","2027-11-20"); // sábado feriado
  assert.strictEqual(r.tipo, "finde");
});
t("marcado a mano tiene prioridad", () => {
  const r = est("Ventas","Pacheco Julian","2026-11-28", { manual: { t: true, h: "15 a 23" } });
  assert.strictEqual(r.h, "15 a 23");
  assert(!est("Ventas","Pacheco Julian","2026-11-25", { manual: { t: false } }).trabaja);
});
t("cálculo de horas", () => {
  assert.strictEqual(L.minutos("7 a 15"), 480);
  assert.strictEqual(L.minutos("7:30 a 12 · 17:30 a 21"), 270 + 210);
  assert.strictEqual(L.minutos("23 a 07"), 480);          // cruza medianoche
  assert.strictEqual(L.minutos("16:30 a 00:30"), 480);
  assert.strictEqual(L.minutos("Horario a confirmar"), null);
});
t("planilla de finde nueva cargada por un administrador", () => {
  const orig = L.getData(), D = L.getData();
  // el admin carga la planilla del Grupo B del 28/11 tal cual sale: la rotación arranca de ahí
  D.FINDE.B.base = "2026-11-28";
  D.FINDE.B.sab = [["Ventas","Juan Renzo","8 a 16"],["Ventas","Mitre Florencia","16 a 00"]];
  L.setData(D);
  assert.strictEqual(est("Ventas","Juan Renzo","2026-11-28").h, "8 a 16");
  assert.strictEqual(est("Ventas","Juan Renzo","2026-12-12").h, "16 a 00");
  assert.strictEqual(est("Ventas","Mitre Florencia","2026-12-12").h, "8 a 16");
  // el Grupo A no se toca
  assert.strictEqual(est("Ventas","Suarez Nahiara","2026-11-21").h, "14 a 23");
  L.setData(orig);
  assert.strictEqual(est("Ventas","Juan Renzo","2026-11-28").h, "14 a 22");
});
t("planilla semanal nueva", () => {
  const orig = L.getData(), D = L.getData();
  D.BASE_LUNES = "2026-12-07"; L.setData(D);
  assert.strictEqual(est("Ventas","Pacheco Julian","2026-12-09").h, "16:30 a 00:30");
  L.setData(orig);
});
t("ajuste manual de grupo y feriado por persona", () => {
  const orig = L.getData(), D = L.getData();
  D.GRUPO_FIJO = { "Rojas Yohana": "A" }; D.TRABAJO_FERIADO_BASE = { "Rojas Yohana": true }; L.setData(D);
  assert(est("Ventas","Rojas Yohana","2026-12-05").trabaja);
  assert(!est("Ventas","Rojas Yohana","2026-11-28").trabaja);
  assert(!est("Ventas","Rojas Yohana","2026-12-08").trabaja);
  assert(est("Ventas","Rojas Yohana","2026-12-25").trabaja);
  L.setData(orig);
});
t("puentes y correcciones de feriados", () => {
  const orig = L.getData(), D = L.getData();
  D.PUENTES = { 2027: ["2027-03-22"] }; D.FERIADOS_QUITAR = ["2027-11-20"]; D.FERIADOS_EXTRA = { "2027-05-24": "Prueba" }; L.setData(D);
  assert.strictEqual(L.feriado(D_("2027-03-22")).tipo, "puente");
  assert.strictEqual(L.feriado(D_("2027-11-20")), null);
  assert.strictEqual(L.feriado(D_("2027-05-24")).nombre, "Prueba");
  L.setData(orig);
});
t("Silva Virginia es solo del Grupo A", () => {
  assert.strictEqual(L.grupoAuto("Silva Virginia"), "A");
  assert(est("Ventas","Silva Virginia","2026-11-21").trabaja);
  assert(est("Ventas","Silva Virginia","2026-11-22").trabaja);
  assert(!est("Ventas","Silva Virginia","2026-11-28").trabaja);
  assert(!est("Ventas","Silva Virginia","2026-11-29").trabaja);
  assert(est("Ventas","Silva Virginia","2026-12-05").trabaja);
  assert(est("Ventas","Daverio Daniela","2026-11-29").trabaja);
});
t("planilla del 30/11: negritas fijas y Peralta fijo 17 a 01", () => {
  const v = W.SECTORES.find(x => x.nombre === "Ventas").personas;
  assert.strictEqual(JSON.stringify(v.filter(p => p.fijo).map(p => p.n)), JSON.stringify(["Ferreyra Sebastian", "Banegas Fabian", "Peralta Alejandro", "Lugones Maximiliano"]));
  ["2026-12-02", "2026-12-09", "2027-01-13", "2027-03-03"].forEach(f => assert.strictEqual(est("Ventas","Peralta Alejandro",f).h, "17 a 01", f));
  assert(est("Ventas","Peralta Alejandro","2026-12-05").trabaja);          // sigue en los findes del Grupo A
  assert.strictEqual(est("Ventas","Pacheco Julian","2026-12-09").h, "10 a 13:30 · 20 a 00:30"); // la rotación no cambia
});
console.log("OK:", ok, "pruebas");
