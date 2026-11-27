// Cálculo de horarios en el servidor: carga el mismo logic.js / data.js que usa la app.
process.env.TZ = "America/Argentina/Buenos_Aires";
const fs = require("fs"), path = require("path"), vm = require("vm");

const ctx = { console };
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);
for (const f of ["data.js", "logic.js", "acciones.js"]) {
  const local = path.join(__dirname, "compartido", f);
  const fuente = fs.existsSync(local) ? local : path.join(__dirname, "../../web", f);
  vm.runInContext(fs.readFileSync(fuente, "utf8"), ctx, { filename: f });
}
const L = ctx.L;
const Acciones = ctx.Acciones;
const SEED = L.getData();

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corto = d => d.getDate() + " " + MESES[d.getMonth()];
const hoy = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };

/** Usa las planillas guardadas por los administradores (o las originales). */
function usarDatos(datos) { L.setData(datos || SEED); }

/** Estado de una persona un día, aplicando cambios aceptados o pendientes (no los rechazados). */
function estado(persona, d, cambios) {
  const u = L.ubicar(persona); if (!u) return null;
  const k = L.ymd(d);
  const c = (cambios || []).filter(x => x.persona === persona && x.fecha === k && x.estado !== "rechazado")
    .sort((a, b) => (b.creado || 0) - (a.creado || 0))[0];
  return L.estadoDia(L.getData().SECTORES[u.si], u.pi, d, c ? { manual: { t: !!c.t, h: c.h } } : {});
}

/** Resumen de lunes a domingo: "Lun 30: 16 a 00 · ... · Sáb 5: franco". */
function resumenSemana(persona, lunes, cambios) {
  const partes = []; let min = 0, dias = 0;
  for (let i = 0; i < 7; i++) {
    const d = L.addDays(lunes, i), s = estado(persona, d, cambios);
    if (!s) return null;
    const fer = s.feriado && s.feriado.tipo === "feriado" ? " (feriado)" : "";
    partes.push(`${DIAS[d.getDay()]} ${d.getDate()}${fer}: ${s.trabaja ? (s.h === "Horario a confirmar" ? "trabajás (horario a confirmar)" : s.h) : "franco"}`);
    if (s.trabaja) { dias++; min += L.minutos(s.h) || 0; }
  }
  return {
    titulo: `Tu semana del ${corto(lunes)} al ${corto(L.addDays(lunes, 6))}`,
    texto: partes.join(" · "),
    resumen: `${dias} días · ${L.fmtHoras(min)}`,
  };
}

/** Texto de un cambio (o de varios días del mismo lote). */
function textoCambio(cs) {
  cs = [...cs].sort((a, b) => a.fecha < b.fecha ? -1 : 1);
  const a = L.parseYMD(cs[0].fecha), z = L.parseYMD(cs[cs.length - 1].fecha), c = cs[0];
  const cuando = cs.length === 1 ? `${DIAS[a.getDay()]} ${corto(a)}` : `Del ${corto(a)} al ${corto(z)}`;
  const que = c.t ? (c.h ? "trabajás " + c.h : "trabajás") : "franco";
  return { cuando, que };
}

module.exports = { L, Acciones, SEED, usarDatos, estado, resumenSemana, textoCambio, hoy, corto };
