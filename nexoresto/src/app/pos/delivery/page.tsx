"use client";
// FASE 4.3 · Delivery propio sin comisiones: asignación de cadetes y mapa GPS en vivo.
import { useState } from "react";
import Link from "next/link";
import { Bike, ExternalLink, MapPin, Navigation } from "lucide-react";
import { Shell } from "@/components/ui/Shell";
import { Badge, Btn, Empty, Panel, toast } from "@/components/ui/kit";
import { ENVIO_ESTADO, LiveMap, distanciaKm, etaMin } from "@/components/delivery/LiveMap";
import { QR } from "@/components/ui/QR";
import { useDispatch, useNexo, useNow } from "@/lib/store/NexoProvider";
import { cx, hhmm, money } from "@/lib/format";

export default function Delivery() {
  return <Shell roles={["caja"]} titulo="Delivery · seguimiento GPS" full><Tablero /></Shell>;
}

function Tablero() {
  const s = useNexo();
  const now = useNow(2000);
  const dispatch = useDispatch();
  const envios = s.envios.filter((e) => e.estado !== "entregado" || now - new Date(e.entregado_at ?? e.created_at).getTime() < 30 * 60_000);
  const [foco, setFoco] = useState<string | null>(null);
  const cadetes = s.usuarios.filter((u) => u.rol === "cadete");
  const nombres = Object.fromEntries(cadetes.map((c) => [c.id, c.nombre.split(" ")[0] + " " + (c.nombre.split(" ")[1]?.[0] ?? "") + "."]));
  const sel = envios.find((e) => e.id === foco) ?? envios.find((e) => e.estado === "en_camino") ?? null;
  const origen = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="grid h-[calc(100dvh-3.5rem)] lg:grid-cols-[400px_1fr]">
      <aside className="flex min-h-0 flex-col border-r border-line bg-panel/40">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2 className="eyebrow">Pedidos delivery · {envios.filter((e) => e.estado !== "entregado").length} activos</h2>
          <Link href={`/menu/${s.bar.slug}/delivery`} target="_blank"><Btn size="sm" variant="outline">Carta delivery <ExternalLink size={12} /></Btn></Link>
        </div>
        <ul className="flex-1 space-y-2 overflow-y-auto p-3 scroll-thin">
          {envios.length === 0 && <Empty icon={<Bike size={30} />} title="Sin envíos" hint="Los pedidos de delivery de la WebApp aparecen acá." />}
          {envios.map((e) => {
            const ped = s.pedidos.find((p) => p.id === e.pedido_id);
            const eta = etaMin(e);
            const est = ENVIO_ESTADO[e.estado];
            return (
              <li key={e.id}>
                <button onClick={() => setFoco(e.id)} className={cx("w-full rounded-xl border p-3 text-left transition", sel?.id === e.id ? "border-up/60 bg-up/5" : "border-line hover:border-mute")}>
                  <div className="flex items-center justify-between"><span className="font-mono font-semibold">#D-{ped?.numero}</span><Badge tono={est.tono}>{est.t}</Badge></div>
                  <div className="mt-1 text-sm">{e.direccion}</div>
                  <div className="mt-1 flex justify-between text-xs text-mute">
                    <span>{ped?.cliente_nombre} · {money(ped?.total ?? 0)}</span>
                    <span className="font-mono">{e.estado === "en_camino" && eta ? `ETA ${eta} min` : hhmm(e.created_at)}</span>
                  </div>
                </button>
                {e.estado !== "entregado" && (
                  <div className="mt-1.5 flex items-center gap-2 px-1 text-xs">
                    <span className="text-mute">Cadete:</span>
                    <select value={e.cadete_id ?? ""} onChange={async (ev) => { await dispatch({ type: "asignarCadete", envio_id: e.id, cadete_id: ev.target.value }); toast("Cadete asignado"); }}
                      className="h-8 flex-1 rounded-lg border border-line bg-bg px-2 text-xs" disabled={e.estado === "en_camino"}>
                      <option value="">Sin asignar</option>
                      {cadetes.map((c) => {
                        const carga = s.envios.filter((x) => x.cadete_id === c.id && x.estado === "en_camino").length;
                        return <option key={c.id} value={c.id} disabled={carga >= 2 && e.cadete_id !== c.id}>{c.nombre}{carga ? ` (${carga} en viaje)` : ""}</option>;
                      })}
                    </select>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="relative min-h-[420px]">
        <LiveMap bar={{ lat: s.bar.lat, lng: s.bar.lng, nombre: s.bar.nombre }} envios={envios} foco={foco} nombresCadete={nombres} />
        {sel && (
          <>
            <div className="absolute bottom-4 left-4 z-[500] w-72 rounded-2xl border border-line bg-panel/95 p-4 backdrop-blur">
              <div className="eyebrow">Vista del cliente</div>
              <p className="mt-1 text-sm">
                {sel.estado === "en_camino" && sel.latitud_actual != null
                  ? <>Tu pedido está en camino. <b>{nombres[sel.cadete_id ?? ""] ?? "El cadete"}</b> está a <b className="font-mono">{distanciaKm({ lat: sel.latitud_actual, lng: sel.longitud_actual! }, { lat: sel.lat_destino, lng: sel.lng_destino }).toFixed(1).replace(".", ",")} km</b> de tu domicilio.</>
                  : sel.estado === "entregado" ? "¡Pedido entregado! Gracias por elegirnos." : "Tu pedido se está preparando en cocina."}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <QR value={`${origen}/seguimiento/${sel.tracking_token}`} size={64} className="overflow-hidden rounded-md" />
                <Link href={`/seguimiento/${sel.tracking_token}`} target="_blank" className="text-xs text-up underline">Abrir link de seguimiento</Link>
              </div>
            </div>
            {sel.estado === "en_camino" && (
              <div className="absolute bottom-4 right-4 z-[500] w-64 rounded-2xl border border-line bg-panel/95 p-4 backdrop-blur">
                <div className="eyebrow flex items-center gap-1"><Navigation size={12} />Seguimiento · #D-{s.pedidos.find((p) => p.id === sel.pedido_id)?.numero}</div>
                <div className="mt-1 font-mono text-4xl font-bold text-up">{etaMin(sel) ?? "—"} min</div>
                <Progreso salida={sel.salida_at} eta={etaMin(sel)} now={now} />
                <div className="mt-1 flex justify-between font-mono text-[11px] text-mute"><span>Salió {sel.salida_at ? hhmm(sel.salida_at) : "—"}</span><span>Entrega {hhmm(now + (etaMin(sel) ?? 0) * 60000)}</span></div>
              </div>
            )}
          </>
        )}
        {!sel && <div className="absolute inset-x-0 top-4 z-[500] mx-auto w-fit rounded-full border border-line bg-panel/90 px-4 py-2 text-sm text-mute"><MapPin size={14} className="mr-1 inline" />Elegí un envío para ver su recorrido</div>}
      </section>
    </div>
  );
}

function Progreso({ salida, eta, now }: { salida: string | null; eta: number | null; now: number }) {
  if (!salida || eta == null) return null;
  const trans = (now - new Date(salida).getTime()) / 60000;
  const pct = Math.min(100, (trans / (trans + eta)) * 100);
  return <div className="mt-2 h-2 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-up transition-all" style={{ width: `${pct}%` }} /></div>;
}
