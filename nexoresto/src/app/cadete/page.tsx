"use client";
// FASE 4.3 · App del cadete (celular): "Iniciar viaje" transmite el GPS real con
// navigator.geolocation.watchPosition; "Entregado" cierra el envío.
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MapPin, Navigation, Phone, Satellite } from "lucide-react";
import { Shell } from "@/components/ui/Shell";
import { Badge, Btn, Empty, toast } from "@/components/ui/kit";
import { ENVIO_ESTADO, LiveMap, etaMin } from "@/components/delivery/LiveMap";
import { useDispatch, useNexo, useNow, useSesion } from "@/lib/store/NexoProvider";
import { hhmm, money } from "@/lib/format";
import type { Envio } from "@/lib/types";

export default function Cadete() {
  return <Shell roles={["cadete"]} titulo="Mis viajes" sinSidebar><Viajes /></Shell>;
}

function Viajes() {
  const s = useNexo();
  const sesion = useSesion();
  const mios = s.envios.filter((e) => (sesion?.rol === "cadete" ? e.cadete_id === sesion.usuario_id : !!e.cadete_id) && e.estado !== "cancelado")
    .sort((a, b) => (a.estado === "entregado" ? 1 : 0) - (b.estado === "entregado" ? 1 : 0));
  const activo = mios.find((e) => e.estado === "en_camino") ?? mios.find((e) => e.estado === "listo" || e.estado === "preparando");
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      {!activo && <Empty icon={<Navigation size={30} />} title="Sin viajes asignados" hint="Cuando la caja te asigne un pedido aparece acá con aviso." />}
      {activo && <ViajeActivo envio={activo} />}
      {mios.filter((e) => e.id !== activo?.id).length > 0 && (
        <div>
          <div className="eyebrow mb-2">Otros envíos</div>
          <ul className="space-y-2">
            {mios.filter((e) => e.id !== activo?.id).map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-xl border border-line bg-card p-3 text-sm">
                <span>{e.direccion}</span><Badge tono={ENVIO_ESTADO[e.estado].tono}>{ENVIO_ESTADO[e.estado].t}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ViajeActivo({ envio }: { envio: Envio }) {
  const s = useNexo();
  const dispatch = useDispatch();
  useNow(3000);
  const watch = useRef<number | null>(null);
  const [gps, setGps] = useState<"off" | "real" | "simulado" | "error">("off");
  const ped = s.pedidos.find((p) => p.id === envio.pedido_id);
  const items = s.items.filter((i) => i.pedido_id === envio.pedido_id);

  useEffect(() => () => { if (watch.current != null) navigator.geolocation.clearWatch(watch.current); }, []);
  // Si el envío ya estaba en camino (recarga de página) retomamos la transmisión
  useEffect(() => {
    if (envio.estado === "en_camino" && gps === "off" && "geolocation" in navigator) transmitir();
    if (envio.estado === "entregado" && watch.current != null) { navigator.geolocation.clearWatch(watch.current); watch.current = null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envio.estado]);

  function transmitir() {
    if (!("geolocation" in navigator)) { setGps("simulado"); return; }
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGps("real");
        dispatch({ type: "gps", envio_id: envio.id, lat: pos.coords.latitude, lng: pos.coords.longitude, velocidad_kmh: pos.coords.speed != null ? pos.coords.speed * 3.6 : null });
      },
      () => setGps("simulado"), // sin permiso: la demo simula el recorrido
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }

  async function iniciar() {
    await dispatch({ type: "iniciarViaje", envio_id: envio.id, lat: s.bar.lat, lng: s.bar.lng });
    transmitir();
    toast("Viaje iniciado · compartiendo ubicación");
  }
  async function entregar() {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    await dispatch({ type: "entregarEnvio", envio_id: envio.id });
    setGps("off");
    toast("Entregado. Buen trabajo");
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-card">
      <div className="h-64"><LiveMap bar={{ lat: s.bar.lat, lng: s.bar.lng, nombre: s.bar.nombre }} envios={[envio]} foco={envio.id} /></div>
      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-sm text-mute">#D-{ped?.numero} · {hhmm(envio.created_at)}</div>
            <div className="mt-1 flex items-center gap-2 text-lg font-semibold"><MapPin size={18} className="text-down" />{envio.direccion}</div>
            <div className="text-sm text-mute">{ped?.cliente_nombre}</div>
          </div>
          <Badge tono={ENVIO_ESTADO[envio.estado].tono}>{ENVIO_ESTADO[envio.estado].t}</Badge>
        </div>
        <ul className="space-y-1 rounded-xl bg-bg/60 p-3 text-sm">
          {items.map((i) => <li key={i.id} className="flex justify-between"><span>{i.cantidad}× {i.nombre}</span></li>)}
          <li className="flex justify-between border-t border-line pt-1 font-semibold"><span>{(ped?.pagado ?? 0) >= (ped?.total ?? 0) ? "Pagado online" : "Cobrar al entregar"}</span><span className="font-mono">{money(ped?.total ?? 0)}</span></li>
        </ul>
        {envio.estado === "en_camino" && (
          <div className="flex items-center justify-between rounded-xl border border-up/30 bg-up/5 p-3 text-sm">
            <span className="flex items-center gap-2"><Satellite size={16} className={gps === "real" ? "animate-blink text-up" : "text-warn"} />{gps === "real" ? "GPS real transmitiendo" : gps === "simulado" ? "Recorrido simulado (sin permiso de GPS)" : "Conectando GPS…"}</span>
            <span className="font-mono font-semibold text-up">ETA {etaMin(envio) ?? "—"} min</span>
          </div>
        )}
        <div className="grid grid-cols-[auto_1fr] gap-2">
          {ped?.cliente_telefono && <a href={`tel:${ped.cliente_telefono}`}><Btn size="xl" variant="ghost"><Phone size={18} /></Btn></a>}
          {envio.estado === "en_camino"
            ? <Btn size="xl" variant="primary" onClick={entregar} className="col-start-2"><CheckCircle2 size={20} />Entregado</Btn>
            : <Btn size="xl" variant="info" onClick={iniciar} disabled={envio.estado === "preparando"} className="col-start-2"><Navigation size={20} />{envio.estado === "preparando" ? "Esperando cocina…" : "Iniciar viaje"}</Btn>}
        </div>
      </div>
    </div>
  );
}
