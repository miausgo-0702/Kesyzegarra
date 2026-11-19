import { itemsDe, minutosDesde, pedidosAbiertosMesa } from "@/lib/store/selectors";
import type { EstadoMesa, Mesa, NexoState } from "@/lib/types";

export const ESTILO_MESA: Record<EstadoMesa, { label: string; borde: string; fondo: string; texto: string; punto: string }> = {
  libre: { label: "Libre", borde: "border-up/70", fondo: "bg-up/[0.06]", texto: "text-up", punto: "bg-up" },
  ocupada: { label: "Ocupada", borde: "border-info/70", fondo: "bg-info/[0.07]", texto: "text-info", punto: "bg-info" },
  esperando: { label: "Esperando comida", borde: "border-violet/70", fondo: "bg-violet/[0.07]", texto: "text-violet", punto: "bg-violet" },
  cuenta_pedida: { label: "Pidió cuenta", borde: "border-warn/80", fondo: "bg-warn/[0.08]", texto: "text-warn", punto: "bg-warn" },
  reservada: { label: "Reservada", borde: "border-mute/50", fondo: "bg-raised/50", texto: "text-mute", punto: "bg-mute" },
  demorada: { label: "Demorada", borde: "border-down", fondo: "bg-down/[0.09]", texto: "text-down", punto: "bg-down" },
};

/** Estado visual: si hay ítems esperando más que su tiempo objetivo + 6 min, la mesa se marca demorada. */
export function estadoVisual(s: NexoState, m: Mesa, now: number): EstadoMesa {
  if (m.estado === "cuenta_pedida" || m.estado === "libre" || m.estado === "reservada") return m.estado;
  const pend = pedidosAbiertosMesa(s, m.id).flatMap((p) => itemsDe(s, p.id)).filter((i) => i.estado_cocina === "pendiente" || i.estado_cocina === "marchando");
  if (pend.some((i) => minutosDesde(i.creado_at, now) > (s.productos.find((p) => p.id === i.producto_id)?.tiempo_objetivo_min ?? 12) + 6)) return "demorada";
  return pend.length ? "esperando" : m.estado === "demorada" || m.estado === "esperando" ? "ocupada" : m.estado;
}

