"use client";
// Seguimiento público del delivery: el cliente ve SOLO su cadete y su pedido.
import { use } from "react";
import { CheckCircle2, ChefHat, Clock, Navigation, Package } from "lucide-react";
import { Logo } from "@/components/ui/kit";
import { LiveMap, etaMin } from "@/components/delivery/LiveMap";
import { useNexo, useNow } from "@/lib/store/NexoProvider";
import { cx, hhmm, money } from "@/lib/format";

export default function Seguimiento({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const s = useNexo();
  useNow(3000);
  const envio = s.envios.find((e) => e.tracking_token === token);
  if (!envio) return <div className="grid min-h-dvh place-items-center p-6 text-center text-mute">Link de seguimiento inválido o vencido.</div>;
  const ped = s.pedidos.find((p) => p.id === envio.pedido_id);
  const items = s.items.filter((i) => i.pedido_id === envio.pedido_id);
  const pasos = [
    { k: "recibido", t: "Pedido recibido", hecho: true, icon: Package, hora: envio.created_at },
    { k: "prep", t: "En preparación", hecho: envio.estado !== "pendiente", icon: ChefHat, hora: null },
    { k: "camino", t: "En camino", hecho: envio.estado === "en_camino" || envio.estado === "entregado", icon: Navigation, hora: envio.salida_at },
    { k: "entregado", t: "Entregado", hecho: envio.estado === "entregado", icon: CheckCircle2, hora: envio.entregado_at },
  ];
  const eta = etaMin(envio);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="flex items-center justify-between p-4"><Logo /><span className="font-mono text-sm text-mute">#D-{ped?.numero}</span></header>
      <div className="h-[46dvh]"><LiveMap bar={{ lat: s.bar.lat, lng: s.bar.lng, nombre: s.bar.nombre }} envios={[envio]} foco={envio.id} /></div>
      <div className="-mt-6 flex-1 rounded-t-3xl border-t border-line bg-panel p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="eyebrow">{envio.estado === "entregado" ? "Entregado" : "Llega en"}</div>
            <div className="font-mono text-4xl font-bold text-up">{envio.estado === "entregado" ? "¡Listo!" : envio.estado === "en_camino" ? `${eta ?? "—"} min` : "≈ 25 min"}</div>
          </div>
          <Clock className="text-mute" />
        </div>
        <ol className="mt-5 space-y-3">
          {pasos.map((p) => (
            <li key={p.k} className="flex items-center gap-3">
              <span className={cx("grid h-8 w-8 place-items-center rounded-full", p.hecho ? "bg-up text-black" : "bg-raised text-dim")}><p.icon size={16} /></span>
              <span className={cx("flex-1", p.hecho ? "text-ink" : "text-dim")}>{p.t}</span>
              <span className="font-mono text-xs text-mute">{p.hora ? hhmm(p.hora) : "—"}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5 rounded-xl border border-line p-3 text-sm">
          {items.map((i) => <div key={i.id} className="flex justify-between"><span>{i.cantidad}× {i.nombre}</span><span className="font-mono">{money(i.cantidad * i.precio_unitario)}</span></div>)}
          <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold"><span>Total</span><span className="font-mono">{money(ped?.total ?? 0)}</span></div>
        </div>
      </div>
    </div>
  );
}
