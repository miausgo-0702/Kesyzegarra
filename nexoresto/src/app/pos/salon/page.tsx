"use client";
// =============================================================================
//  FASE 4.1 · Mapa de salón para mozos y caja
//  Plano por sector con colores según estado, avisos de "listo para retirar"
//  y comanda táctil al tocar una mesa.
// =============================================================================
import { useMemo, useState } from "react";
import { ArrowRightLeft, BellRing, Check, Clock3, Users } from "lucide-react";
import { Shell } from "@/components/ui/Shell";
import { Badge, Btn, Kpi, Modal, Segmented, toast } from "@/components/ui/kit";
import { ComandaEditor } from "@/components/pos/ComandaEditor";
import { useDispatch, useNexo, useNow, useSesion } from "@/lib/store/NexoProvider";
import { cronometro, cx, hhmm, money } from "@/lib/format";
import { estimarEstacion } from "@/lib/ai/learningEngine";
import { kpisJornada, saldoMesa } from "@/lib/store/selectors";
import { ESTILO_MESA, estadoVisual } from "@/components/pos/mesas";
import type { EstadoMesa, Mesa } from "@/lib/types";

const duracion = (ms: number) => {
  const min = Math.max(0, Math.floor(ms / 60000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}`;
};

export default function Salon() {
  return (
    <Shell roles={["mozo", "caja"]} titulo="Salón">
      <MapaSalon />
    </Shell>
  );
}

function MapaSalon() {
  const s = useNexo();
  const now = useNow(5000);
  const sesion = useSesion();
  const dispatch = useDispatch();
  const [sector, setSector] = useState<string>("todos");
  const [abierta, setAbierta] = useState<Mesa | null>(null);
  const [soloMias, setSoloMias] = useState(false);

  const mesas = s.mesas.filter((m) => (sector === "todos" || m.sector_id === sector) && (!soloMias || m.mozo_id === sesion?.usuario_id));
  const avisos = s.notificaciones.filter((n) => !n.leida && n.para === "mozo");
  const k = kpisJornada(s);
  const misMesas = s.mesas.filter((m) => m.mozo_id === sesion?.usuario_id && m.estado !== "libre").length;
  const etaCocina = estimarEstacion(s, "cocina", now);
  const conteo = useMemo(() => {
    const c: Partial<Record<EstadoMesa, number>> = {};
    for (const m of s.mesas) { const e = estadoVisual(s, m, now); c[e] = (c[e] ?? 0) + 1; }
    return c;
  }, [s, now]);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Segmented value={sector} onChange={setSector} options={[{ value: "todos", label: "Todos" }, ...s.sectores.map((x) => ({ value: x.id, label: x.nombre }))]} />
          <button onClick={() => setSoloMias((v) => !v)} className={cx("rounded-xl border px-3 py-2 text-sm", soloMias ? "border-up/50 text-up" : "border-line text-mute")}>Solo mis mesas</button>
          <div className="flex flex-wrap gap-3 text-xs text-mute">
            {(Object.keys(ESTILO_MESA) as EstadoMesa[]).map((e) => (
              <span key={e} className="flex items-center gap-1.5"><span className={cx("h-2.5 w-2.5 rounded-sm", ESTILO_MESA[e].punto)} />{ESTILO_MESA[e].label} <b className="text-ink">{conteo[e] ?? 0}</b></span>
            ))}
          </div>
        </div>

        {s.sectores.filter((x) => sector === "todos" || x.id === sector).map((sec) => {
          const ms = mesas.filter((m) => m.sector_id === sec.id);
          if (!ms.length) return null;
          return (
            <section key={sec.id} className="mb-6">
              <h2 className="eyebrow mb-2">{sec.nombre}</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-5">
                {ms.map((m) => {
                  const est = estadoVisual(s, m, now);
                  const st = ESTILO_MESA[est];
                  const { total } = saldoMesa(s, m.id);
                  const mozo = s.usuarios.find((u) => u.id === m.mozo_id)?.nombre.split(" ")[0];
                  const reserva = s.reservas.find((r) => r.mesa_id === m.id && r.estado === "confirmada" && new Date(r.inicio).getTime() > now - 30 * 60000 && new Date(r.inicio).getTime() - now < 3 * 3600_000);
                  return (
                    <button key={m.id} onClick={() => setAbierta(m)}
                      className={cx("group relative flex aspect-[4/3] flex-col items-center justify-center rounded-2xl border-2 p-3 transition active:scale-[0.97] hover:brightness-125", st.borde, st.fondo, est === "demorada" && "animate-pulseRing")}>
                      <span className="font-mono text-4xl font-bold">{m.numero}</span>
                      <span className={cx("mt-1 text-[10px] font-bold uppercase tracking-[0.14em]", st.texto)}>{st.label}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] text-mute"><Users size={11} />{m.capacidad} pax{mozo && ` · ${mozo}`}</span>
                      {total > 0 && <span className="absolute right-2 top-2 font-mono text-[11px] text-ink/80">{money(total)}</span>}
                      {m.ocupada_desde && est !== "libre" && <span className="absolute left-2 top-2 flex items-center gap-1 font-mono text-[11px] text-mute"><Clock3 size={10} />{duracion(now - new Date(m.ocupada_desde).getTime())}</span>}
                      {reserva && est === "reservada" && <span className="absolute bottom-2 text-[10px] text-mute">{reserva.nombre} · {hhmm(reserva.inicio)}</span>}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Mis mesas hoy" value={misMesas} />
          <Kpi label="Ventas del turno" value={<span className="text-up">{money(k.ventas)}</span>} delta={`${k.pedidos} pedidos`} />
          <Kpi label="Prom. entrega cocina" value={cronometro(etaCocina.demora_prom_turno_min * 60000)} delta={`ETA nuevo ${Math.round(etaCocina.eta_nuevo_pedido_min)} min`} tono={etaCocina.desvio_min > 3 ? "warn" : "up"} />
          <Kpi label="Ocupación" value={`${Math.round((s.mesas.filter((m) => m.estado !== "libre").length / s.mesas.length) * 100)} %`} />
        </div>
      </div>

      <aside className="flex flex-col gap-3">
        <div className="rounded-2xl border border-line bg-card/80 p-4">
          <div className="mb-3 flex items-center justify-between"><h3 className="eyebrow">Listo para retirar</h3><Badge tono={avisos.length ? "up" : "mute"}>{avisos.length}</Badge></div>
          {avisos.length === 0 && <p className="text-sm text-mute">Cuando cocina o barra despachen, el aviso llega acá al instante.</p>}
          <ul className="flex flex-col gap-2">
            {avisos.slice(0, 8).map((n) => (
              <li key={n.id} className="flex animate-slideIn items-center gap-3 rounded-xl border border-up/30 bg-up/5 p-3">
                <BellRing size={18} className="shrink-0 text-up" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{n.texto}</div>
                  <div className="font-mono text-[11px] text-mute">{hhmm(n.created_at)}</div>
                </div>
                <Btn size="sm" variant="primary" onClick={async () => {
                  if (n.pedido_id) await dispatch({ type: "entregarPedido", pedido_id: n.pedido_id });
                  await dispatch({ type: "notificacionLeida", id: n.id });
                  toast("Entregado en mesa");
                }}><Check size={14} />Entregado</Btn>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-card/80 p-4">
          <h3 className="eyebrow mb-2">Pidieron la cuenta</h3>
          <ul className="space-y-1 text-sm">
            {s.mesas.filter((m) => m.estado === "cuenta_pedida").map((m) => <li key={m.id} className="flex justify-between"><span>Mesa {m.numero}</span><span className="font-mono text-warn">{money(saldoMesa(s, m.id).saldo)}</span></li>)}
            {!s.mesas.some((m) => m.estado === "cuenta_pedida") && <li className="text-mute">Ninguna</li>}
          </ul>
        </div>
      </aside>

      <Modal open={!!abierta} onClose={() => setAbierta(null)} wide
        title={abierta && <span className="flex items-center gap-3">Mesa {String(abierta.numero).padStart(2, "0")} · {abierta.capacidad} pax <Badge tono="mute">{ESTILO_MESA[estadoVisual(s, s.mesas.find((x) => x.id === abierta.id) ?? abierta, now)].label}</Badge></span>}>
        {abierta && (
          <div className="flex h-[calc(94dvh-5.5rem)] flex-col gap-3 sm:h-[72dvh]">
            <MoverMesa mesaId={abierta.id} onMovida={(n) => { setAbierta(null); toast(n); }} />
            <div className="min-h-0 flex-1"><ComandaEditor mesa={s.mesas.find((x) => x.id === abierta.id) ?? abierta} /></div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Mover los pedidos a otra mesa (si la destino está ocupada, se unen las cuentas). */
function MoverMesa({ mesaId, onMovida }: { mesaId: string; onMovida: (msg: string) => void }) {
  const s = useNexo();
  const dispatch = useDispatch();
  const sesion = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [destino, setDestino] = useState("");
  const tieneAbiertos = s.pedidos.some((p) => p.mesa_id === mesaId && p.estado !== "cerrado" && p.estado !== "anulado");
  if (!tieneAbiertos) return null;
  const origen = s.mesas.find((m) => m.id === mesaId)!;
  const d = s.mesas.find((m) => m.id === destino);
  const unir = !!d && d.estado !== "libre" && d.estado !== "reservada";
  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="press flex shrink-0 items-center gap-2 self-start rounded-xl border border-line px-3 py-2 text-sm text-mute hover:text-ink">
        <ArrowRightLeft size={15} />Mover o unir mesa
      </button>
    );
  }
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-line bg-bg/60 p-2 text-sm">
      <ArrowRightLeft size={16} className="ml-1 text-mute" />
      <select id="mover-mesa" value={destino} onChange={(e) => setDestino(e.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 text-sm" aria-label="Mesa de destino">
        <option value="">Pasar a la mesa…</option>
        {s.mesas.filter((m) => m.id !== mesaId).map((m) => (
          <option key={m.id} value={m.id}>Mesa {m.numero} · {m.estado === "libre" ? "libre" : m.estado === "reservada" ? "reservada" : "ocupada (une cuentas)"}</option>
        ))}
      </select>
      <Btn size="sm" variant={unir ? "warn" : "primary"} disabled={!destino} onClick={async () => {
        const e = await dispatch({ type: "moverMesa", origen_id: mesaId, destino_id: destino, usuario: sesion?.nombre });
        if (e) return toast(e, "down");
        onMovida(unir ? `Mesa ${origen.numero} unida a la mesa ${d!.numero}` : `Pedidos pasados a la mesa ${d?.numero}`);
      }}>{unir ? "Unir" : "Mover"}</Btn>
      <Btn size="sm" variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Btn>
    </div>
  );
}
