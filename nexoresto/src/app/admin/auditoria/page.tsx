"use client";
// FASE 6.1 · Auditoría: anulaciones, descuentos, cierres de caja, cambios de precio y crashes.
import { useState } from "react";
import { Undo2 } from "lucide-react";
import { Shell } from "@/components/ui/Shell";
import { Badge, Btn, Panel, Segmented, Kpi, toast } from "@/components/ui/kit";
import { ExportBtns } from "@/components/ui/ExportBtns";
import { useDispatch, useNexo, useSesion } from "@/lib/store/NexoProvider";
import { cx, fechaCorta, hhmm, money } from "@/lib/format";
import type { Auditoria as A } from "@/lib/types";

const ETIQUETA: Record<string, { t: string; tono: "down" | "warn" | "info" | "up" | "mute" | "violet" | "crash" }> = {
  anulacion_item: { t: "Anulación", tono: "down" }, descuento: { t: "Descuento", tono: "warn" }, cierre_caja: { t: "Cierre caja", tono: "info" },
  apertura_caja: { t: "Apertura", tono: "mute" }, market_crash: { t: "Crash", tono: "crash" }, cambio_precio: { t: "Precio", tono: "violet" },
  reglas_exchange: { t: "Reglas", tono: "violet" }, compra: { t: "Compra", tono: "up" }, merma: { t: "Merma", tono: "warn" }, cierre_votacion: { t: "Votación", tono: "up" },
};

export default function Auditoria() {
  return <Shell roles={[]} titulo="Auditoría"><Registro /></Shell>;
}

function Registro() {
  const s = useNexo();
  const dispatch = useDispatch();
  const sesion = useSesion();
  const [tipo, setTipo] = useState<"todos" | A["tipo"]>("todos");
  const filas = s.auditoria.filter((a) => tipo === "todos" || a.tipo === tipo).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const anul = s.auditoria.filter((a) => a.accion === "anulacion_item");
  const desc = s.auditoria.filter((a) => a.accion === "descuento");
  const difs = s.turnos.filter((t) => t.estado === "cerrado").reduce((a, t) => a + Math.abs(t.diferencia_total ?? 0), 0);
  const conMovimiento = s.productos.filter((p) => p.es_cotizable_bolsa && p.precio_actual !== p.precio_base);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Anulaciones" value={anul.length} delta={money(anul.reduce((a, x) => a + (x.monto ?? 0), 0))} tono="down" />
        <Kpi label="Descuentos aplicados" value={desc.length} delta={money(desc.reduce((a, x) => a + (x.monto ?? 0), 0))} tono="warn" />
        <Kpi label="Diferencias de caja" value={money(difs)} delta="suma absoluta de cierres" tono={difs ? "down" : "up"} />
        <Kpi label="Eventos registrados" value={s.auditoria.length} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Historial" action={<span className="flex items-center gap-2"><Segmented value={tipo} onChange={setTipo} options={[{ value: "todos", label: "Todo" }, { value: "operacion", label: "Operación" }, { value: "caja", label: "Caja" }, { value: "precio", label: "Precios" }]} /><ExportBtns nombre="auditoria" filas={() => filas.map((a) => ({ Fecha: new Date(a.created_at).toLocaleString("es-AR"), Usuario: a.usuario, Acción: a.accion, Tipo: a.tipo, Detalle: a.detalle, Monto: a.monto ?? "" }))} /></span>}>
          <div className="max-h-[64dvh] overflow-y-auto scroll-thin">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card"><tr className="eyebrow text-left"><th className="py-2">Cuándo</th><th>Acción</th><th>Usuario</th><th>Detalle</th><th className="text-right">Monto</th></tr></thead>
              <tbody>
                {filas.map((a) => (
                  <tr key={a.id} className="border-t border-line/60">
                    <td className="py-2 font-mono text-xs text-mute">{fechaCorta(a.created_at)} {hhmm(a.created_at)}</td>
                    <td><Badge tono={ETIQUETA[a.accion]?.tono ?? "mute"}>{ETIQUETA[a.accion]?.t ?? a.accion}</Badge></td>
                    <td className="whitespace-nowrap">{a.usuario}</td>
                    <td className="text-mute">{a.detalle}</td>
                    <td className={cx("text-right font-mono", (a.monto ?? 0) < 0 && "text-down")}>{a.monto != null ? money(a.monto) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Precios fuera de base · revertir">
          <p className="mb-3 text-xs text-mute">El dueño puede revertir cualquier precio del motor Exchange a su base. Queda auditado.</p>
          <ul className="space-y-2">
            {conMovimiento.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{p.nombre}</span>
                <span className="flex items-center gap-2 font-mono text-xs">
                  <span className="text-mute">{money(p.precio_base)} →</span><span className={p.precio_actual > p.precio_base ? "text-up" : "text-down"}>{money(p.precio_actual)}</span>
                  <Btn size="sm" onClick={async () => { await dispatch({ type: "revertirPrecio", producto_id: p.id, usuario: sesion?.nombre }); toast(`${p.nombre} vuelve a ${money(p.precio_base)}`); }} title="Revertir"><Undo2 size={13} /></Btn>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
