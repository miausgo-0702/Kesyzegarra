const nf = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** $4.250 */
export const money = (n: number) => `${n < 0 ? "−" : ""}$${nf.format(Math.abs(Math.round(n)))}`;
/** +12,5 % */
export const pct = (n: number, signo = true) => `${signo && n > 0 ? "+" : n < 0 ? "−" : ""}${nf1.format(Math.abs(n))} %`;
export const num = (n: number) => nf.format(n);
export const hhmm = (d: string | number | Date) =>
  new Date(d).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
export const hhmmss = (d: string | number | Date) =>
  new Date(d).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
export const fechaCorta = (d: string | number | Date) =>
  new Date(d).toLocaleDateString("es-AR", { weekday: "short", day: "2-digit", month: "short" }).replace(/\./g, "").toUpperCase();
/** 07:42 a partir de milisegundos */
export const cronometro = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
export const cantidad = (n: number, u: string) =>
  u === "g" && Math.abs(n) >= 1000 ? `${nf1.format(n / 1000)} kg`
  : u === "ml" && Math.abs(n) >= 1000 ? `${nf1.format(n / 1000)} L`
  : `${nf.format(n)} ${u === "u" ? "u." : u}`;
export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
