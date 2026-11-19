"use client";
// Reservas inteligentes: calendario por franja horaria, asignación automática
// de la mesa libre de menor capacidad suficiente y lista de espera.
import { useMemo, useState } from "react";
import { CalendarDays, Check, MessageCircle, UserPlus, X } from "lucide-react";
import { Shell } from "@/components/ui/Shell";
import { Badge, Btn, Field, Panel, inputCls, toast } from "@/components/ui/kit";
import { useDispatch, useNexo, useNow } from "@/lib/store/NexoProvider";
import { cx, hhmm } from "@/lib/format";
import type { Mesa, NexoState } from "@/lib/types";

const DESDE = 19, HASTA = 26; // 19:00 → 02:00

function dur(personas: number) { return personas <= 2 ? 90 : personas <= 4 ? 120 : 150; }

function libre(s: NexoState, mesa: Mesa, ini: number, fin: number) {
  return !s.reservas.some((r) => r.mesa_id === mesa.id && ["pendiente", "confirmada", "sentada"].includes(r.estado)
    && new Date(r.inicio).getTime() < fin && ini < new Date(r.inicio).getTime() + r.duracion_min * 60_000);
}

function asignarMesa(s: NexoState, personas: number, ini: number, minutos: number) {
  return s.mesas.filter((m) => m.capacidad >= personas && libre(s, m, ini, ini + minutos * 60_000)).sort((a, b) => a.capacidad - b.capacidad || a.numero - b.numero)[0] ?? null;
}

export default function Reservas() {
  return <Shell roles={["caja", "mozo"]} titulo="Reservas"><Calendario /></Shell>;
}

function Calendario() {
  const s = useNexo();
  const now = useNow(30_000);
  const dispatch = useDispatch();
  const [dia, setDia] = useState(0);
  const base = useMemo(() => { const d = new Date(now); if (d.getHours() < 6) d.setDate(d.getDate() - 1); d.setDate(d.getDate() + dia); d.setHours(0, 0, 0, 0); return d.getTime(); }, [now, dia]);
  const [form, setForm] = useState({ nombre: "", telefono: "", personas: 4, hora: "21:00" });
  const [espera, setEspera] = useState({ nombre: "", personas: 2 });

  const iniForm = base + (() => { const [h, m] = form.hora.split(":").map(Number); return ((h < 6 ? h + 24 : h) * 60 + m) * 60_000; })();
  const sugerida = asignarMesa(s, form.personas, iniForm, dur(form.personas));
  const reservasDia = s.reservas.filter((r) => { const t = new Date(r.inicio).getTime(); return t >= base + DESDE * 3600_000 - 3600_000 && t < base + HASTA * 3600_000 && r.estado !== "cancelada"; });
  const ocup = Math.round((reservasDia.reduce((a, r) => a + r.duracion_min, 0) / (s.mesas.length * (HASTA - DESDE) * 60)) * 100);
  const mesasConReserva = s.mesas.filter((m) => reservasDia.some((r) => r.mesa_id === m.id)).concat(sugerida && !reservasDia.some((r) => r.mesa_id === sugerida.id) ? [sugerida] : []).sort((a, b) => a.numero - b.numero);
  const filas = mesasConReserva.length >= 6 ? mesasConReserva : s.mesas.slice(0, 10);
  const pct = (t: number) => ((t - (base + DESDE * 3600_000)) / ((HASTA - DESDE) * 3600_000)) * 100;

  async function crear() {
    if (!form.nombre.trim()) return toast("Falta el nombre", "warn");
    if (!sugerida) return toast("No hay mesa libre para esa franja: sumalo a la lista de espera", "warn");
    const e = await dispatch({ type: "crearReserva", nombre: form.nombre.trim(), telefono: form.telefono, personas: form.personas, inicio: new Date(iniForm).toISOString(), duracion_min: dur(form.personas), mesa_id: sugerida.id });
    if (e) return toast(e, "down");
    toast(`Reserva confirmada · Mesa ${sugerida.numero}`);
    if (form.telefono) {
      const txt = encodeURIComponent(`¡Hola ${form.nombre}! Tu reserva en ${s.bar.nombre} para ${form.personas} personas el ${new Date(iniForm).toLocaleDateString("es-AR")} a las ${form.hora} está confirmada (mesa ${sugerida.numero}). ¡Te esperamos!`);
      window.open(`https://wa.me/${form.telefono.replace(/\D/g, "")}?text=${txt}`, "_blank", "noopener");
    }
    setForm({ nombre: "", telefono: "", personas: 4, hora: form.hora });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
      <Panel pad={false} className="overflow-hidden">
        <header className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <CalendarDays size={18} className="text-up" />
          <h2 className="text-lg font-semibold capitalize">{new Date(base).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "short" })}</h2>
          <div className="flex gap-1">{[0, 1, 2].map((d) => <button key={d} onClick={() => setDia(d)} className={cx("rounded-lg border px-2.5 py-1 text-xs", dia === d ? "border-up text-up" : "border-line text-mute")}>{d === 0 ? "Hoy" : d === 1 ? "Mañana" : "+2"}</button>)}</div>
          <span className="flex-1" />
          <Badge tono="up">{reservasDia.length} reservas</Badge>
          <Badge tono="mute">Ocupación {ocup} %</Badge>
        </header>
        <div className="overflow-x-auto scroll-thin">
          <div className="min-w-[760px] p-4">
            <div className="ml-24 grid text-[11px] text-mute" style={{ gridTemplateColumns: `repeat(${(HASTA - DESDE) * 2}, 1fr)` }}>
              {Array.from({ length: (HASTA - DESDE) * 2 }, (_, i) => <span key={i} className="font-mono">{i % 2 === 0 ? `${String((DESDE + i / 2) % 24).padStart(2, "0")}:00` : ""}</span>)}
            </div>
            <div className="mt-2 flex flex-col">
              {filas.map((m) => (
                <div key={m.id} className="flex h-12 items-center border-t border-line/60">
                  <span className="w-24 shrink-0 text-xs text-mute">Mesa {m.numero} · {m.capacidad}p</span>
                  <div className="relative h-full flex-1 bg-[repeating-linear-gradient(90deg,transparent_0,transparent_calc(100%/14-1px),#1e2a36_calc(100%/14-1px),#1e2a36_calc(100%/14))]">
                    {reservasDia.filter((r) => r.mesa_id === m.id).map((r) => {
                      const ini = new Date(r.inicio).getTime();
                      const tono = r.personas >= 8 ? "border-info/70 bg-info/15 text-info" : r.estado === "sentada" ? "border-mute bg-raised text-mute" : r.personas >= 6 ? "border-warn/70 bg-warn/15 text-warn" : "border-up/60 bg-up/10 text-up";
                      return (
                        <div key={r.id} className={cx("group absolute top-1.5 bottom-1.5 flex items-center justify-between gap-1 overflow-hidden rounded-lg border px-2 text-xs font-semibold", tono)} style={{ left: `${Math.max(pct(ini), 0)}%`, width: `${(r.duracion_min / ((HASTA - DESDE) * 60)) * 100}%` }} title={`${r.nombre} · ${r.personas} pax · ${hhmm(r.inicio)}`}>
                          <span className="truncate">{r.nombre} · {r.personas}</span>
                          <span className="hidden gap-1 group-hover:flex">
                            {r.estado !== "sentada" && <button onClick={() => dispatch({ type: "reservaEstado", id: r.id, estado: "sentada" })} className="rounded bg-black/40 p-0.5" title="Sentar"><Check size={12} /></button>}
                            <button onClick={() => dispatch({ type: "reservaEstado", id: r.id, estado: "cancelada" })} className="rounded bg-black/40 p-0.5" title="Cancelar"><X size={12} /></button>
                          </span>
                        </div>
                      );
                    })}
                    {sugerida?.id === m.id && <div className="absolute top-1.5 bottom-1.5 rounded-lg border-2 border-dashed border-up/70" style={{ left: `${pct(iniForm)}%`, width: `${(dur(form.personas) / ((HASTA - DESDE) * 60)) * 100}%` }} />}
                    {dia === 0 && pct(now) > 0 && pct(now) < 100 && <div className="absolute inset-y-0 w-px bg-down" style={{ left: `${pct(now)}%` }} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <div className="flex flex-col gap-4">
        <Panel title="Nueva reserva">
          <div className="space-y-3">
            <Field label="Nombre"><input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={inputCls} placeholder="Marina Vega" /></Field>
            <Field label="Teléfono (WhatsApp)"><input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className={inputCls} placeholder="+54 385 …" inputMode="tel" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Comensales"><input type="number" min={1} max={20} value={form.personas} onChange={(e) => setForm({ ...form, personas: Math.max(1, Number(e.target.value)) })} className={inputCls} /></Field>
              <Field label="Franja"><select value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} className={inputCls}>
                {Array.from({ length: (HASTA - DESDE) * 2 - 2 }, (_, i) => { const h = (DESDE + Math.floor(i / 2)) % 24; const v = `${String(h).padStart(2, "0")}:${i % 2 ? "30" : "00"}`; return <option key={v}>{v}</option>; })}
              </select></Field>
            </div>
            <div className={cx("rounded-xl border p-3", sugerida ? "border-up/40 bg-up/5" : "border-warn/40 bg-warn/5")}>
              <div className="eyebrow !text-up">Mesa asignada automáticamente</div>
              <div className="mt-1 font-semibold">{sugerida ? `Mesa ${sugerida.numero} · ${s.sectores.find((x) => x.id === sugerida.sector_id)?.nombre} (${sugerida.capacidad} pax)` : "Sin mesa libre en esa franja"}</div>
              <div className="text-xs text-mute">Duración estándar {dur(form.personas)} min para {form.personas} personas</div>
            </div>
            <Btn variant="primary" size="lg" className="w-full" onClick={crear}><MessageCircle size={18} />Confirmar y avisar por WhatsApp</Btn>
          </div>
        </Panel>
        <Panel title={`Lista de espera · ${s.espera.length}`}>
          <ul className="mb-3 space-y-2">
            {s.espera.map((e) => {
              const m = asignarMesa(s, e.personas, now, dur(e.personas));
              return (
                <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{e.nombre} · {e.personas} pax <span className="font-mono text-xs text-mute">{Math.round((now - new Date(e.desde).getTime()) / 60000)} min</span></span>
                  <span className="flex gap-1">
                    {m && <Btn size="sm" variant="primary" onClick={async () => { await dispatch({ type: "crearReserva", nombre: e.nombre, telefono: "", personas: e.personas, inicio: new Date(now).toISOString(), duracion_min: dur(e.personas), mesa_id: m.id }); await dispatch({ type: "mesaEstado", mesa_id: m.id, estado: "ocupada" }); await dispatch({ type: "quitarEspera", id: e.id }); toast(`${e.nombre} → Mesa ${m.numero}`); }}>Mesa {m.numero}</Btn>}
                    <Btn size="sm" onClick={() => dispatch({ type: "quitarEspera", id: e.id })}><X size={14} /></Btn>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-2">
            <input value={espera.nombre} onChange={(e) => setEspera({ ...espera, nombre: e.target.value })} placeholder="Nombre" className={cx(inputCls, "h-10")} />
            <input type="number" min={1} value={espera.personas} onChange={(e) => setEspera({ ...espera, personas: Number(e.target.value) })} className={cx(inputCls, "h-10 w-16")} />
            <Btn onClick={() => { if (espera.nombre) { dispatch({ type: "agregarEspera", nombre: espera.nombre, personas: espera.personas }); setEspera({ nombre: "", personas: 2 }); } }}><UserPlus size={16} /></Btn>
          </div>
        </Panel>
      </div>
    </div>
  );
}
