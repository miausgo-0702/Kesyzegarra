"use client";
// =============================================================================
//  FASE 6.1 · Dashboard ejecutivo del dueño/gerente (tiempo real)
//  KPIs con ganancia neta real (ventas − costo de recetas − mermas), ventas por
//  hora, horas pico, ranking de rentabilidad, alertas, auditoría de caja e IA.
// =============================================================================
import { useMemo } from "react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight } from "lucide-react";
import { Shell } from "@/components/ui/Shell";
import { Badge, Kpi, Panel } from "@/components/ui/kit";
import { ExportBtns } from "@/components/ui/ExportBtns";
import { AiAssistantPanel } from "@/components/ai/AiAssistantPanel";
import { useNexo, useNow } from "@/lib/store/NexoProvider";
import { cantidad, cx, hhmm, money, pct } from "@/lib/format";
import { kpisJornada, nivelStock, rentabilidadProductos, ventasPorHora } from "@/lib/store/selectors";

export default function Dashboard() {
  return <Shell roles={[]} titulo="Resumen del día"><Tablero /></Shell>;
}

function Tablero() {
  const s = useNexo();
  const now = useNow(15_000);
  const k = useMemo(() => kpisJornada(s), [s]);
  const ayer = useMemo(() => { const d = new Date(now); d.setHours(6, 0, 0, 0); if (new Date(now).getHours() < 6) d.setDate(d.getDate() - 1); return d; }, [now]);
  const horas = useMemo(() => ventasPorHora(s), [s]);
  const rent = useMemo(() => rentabilidadProductos(s), [s]);
  const pico = [...horas].sort((a, b) => b.ventas - a.ventas)[0];
  const maxMargen = Math.max(...rent.map((r) => r.margen), 1);

  const alertas = [
    ...s.insumos.filter((i) => nivelStock(i) === "critico").slice(0, 3).map((i) => ({ tag: "Stock", tono: "down" as const, t: `${i.nombre}: queda ${cantidad(i.stock_actual, i.unidad)} (mín. ${cantidad(i.stock_minimo, i.unidad)})` })),
    ...s.mermas.slice(0, 1).map((m) => { const i = s.insumos.find((x) => x.id === m.insumo_id); return { tag: "Merma", tono: "warn" as const, t: `${i?.nombre}: ${cantidad(m.cantidad, i?.unidad ?? "u")} por ${m.motivo}` }; }),
    ...s.turnos.filter((t) => t.estado === "cerrado" && (t.diferencia_total ?? 0) !== 0).slice(0, 1).map((t) => ({ tag: "Caja", tono: "warn" as const, t: `Diferencia de arqueo ${money(t.diferencia_total ?? 0)} · ${t.caja_nombre}` })),
    ...s.productos.filter((p) => p.es_cotizable_bolsa && p.precio_actual >= p.precio_maximo).slice(0, 2).map((p) => ({ tag: "Precio", tono: "info" as const, t: `Exchange alcanzó el tope en ${p.nombre} (${money(p.precio_actual)})` })),
  ];

  return (
    <div className="grid gap-4 2xl:grid-cols-[1fr_400px]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Ventas del turno" value={money(k.ventas)} delta={`${k.pedidos} pedidos desde ${hhmm(ayer)}`} />
          <Kpi label="Ticket promedio" value={money(k.ticket)} delta="sin propina" />
          <Kpi label="Costo de mercadería" value={pct(k.costoPct, false)} delta={money(k.costo)} tono="warn" />
          <Kpi label="Margen bruto" value={pct(k.margen, false)} delta="ventas − recetas" />
          <Kpi label="Ganancia neta real" value={<span className="text-up">{money(k.ganancia)}</span>} delta="− costo recetas − mermas" hint="Ventas menos costo de receta de lo vendido y mermas registradas" />
          <Kpi label="Mermas" value={money(k.mermas)} delta="revisar" tono="down" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <Panel title="Ventas por hora" action={<span className="flex flex-wrap items-center gap-2">{pico && <Badge tono="up">Pico {pico.hora}</Badge>}<ExportBtns nombre="ventas-por-hora" filas={() => horas.map((h) => ({ Hora: h.hora, Ventas: Math.round(h.ventas), Pedidos: h.pedidos }))} /></span>}>
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={horas} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs><linearGradient id="vh" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1ee08f" stopOpacity={0.35} /><stop offset="100%" stopColor="#1ee08f" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid stroke="#1e2a36" vertical={false} />
                  <XAxis dataKey="hora" tick={{ fill: "#8a97a6", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fill: "#8a97a6", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip formatter={(v, n) => [n === "ventas" ? money(Number(v)) : v, n === "ventas" ? "Ventas" : "Pedidos"]} contentStyle={{ background: "#0c1117", border: "1px solid #1e2a36", borderRadius: 12 }} />
                  <Area type="monotone" dataKey="ventas" stroke="#1ee08f" strokeWidth={2} fill="url(#vh)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
          <Panel title="Alertas">
            <ul className="flex flex-col gap-2">
              {alertas.map((a, i) => (
                <li key={i} className="flex items-start gap-3 border-b border-line/60 pb-2 text-sm last:border-0">
                  <Badge tono={a.tono} className="mt-0.5 w-16 justify-center">{a.tag}</Badge><span>{a.t}</span>
                </li>
              ))}
              {!alertas.length && <li className="text-sm text-mute">Sin alertas.</li>}
            </ul>
            <Link href="/admin/stock" className="mt-3 flex items-center gap-1 text-xs text-up">Ir a stock y compras <ArrowRight size={12} /></Link>
          </Panel>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <Panel title="Rentabilidad por plato / trago (jornada)" action={<ExportBtns nombre="rentabilidad" filas={() => rent.map((r) => ({ Producto: r.producto.nombre, Unidades: r.unidades, Ventas: Math.round(r.ventas), "Costo receta": r.costo, Ganancia: Math.round(r.ganancia), "Margen %": Math.round(r.margen * 10) / 10, "Precio actual": r.producto.precio_actual }))} />}>
            <table className="w-full text-sm">
              <thead><tr className="eyebrow text-left"><th className="py-2">Producto</th><th className="w-[38%]">Margen</th><th className="text-right">Uds.</th><th className="text-right">Ganancia</th></tr></thead>
              <tbody>
                {rent.slice(0, 10).map((r) => (
                  <tr key={r.producto.id} className="border-t border-line/60">
                    <td className="py-2">{r.producto.nombre}</td>
                    <td className="pr-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-raised"><div className={cx("h-full rounded-full", r.margen >= 75 ? "bg-up" : r.margen >= 60 ? "bg-warn" : "bg-down")} style={{ width: `${(r.margen / maxMargen) * 100}%` }} /></div>
                        <span className="w-10 text-right font-mono text-xs">{Math.round(r.margen)}%</span>
                      </div>
                    </td>
                    <td className="text-right font-mono">{r.unidades}</td>
                    <td className="text-right font-mono text-up">{money(r.ganancia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="Auditoría de caja" action={<Link href="/admin/auditoria" className="text-xs text-up">Ver todo</Link>}>
            <table className="w-full text-sm">
              <thead><tr className="eyebrow text-left"><th className="py-2">Caja</th><th className="text-right">Esperado</th><th className="text-right">Contado</th><th className="text-right">Dif.</th></tr></thead>
              <tbody>
                {s.turnos.filter((t) => t.estado === "cerrado").slice(0, 5).map((t) => {
                  const esp = Object.values(t.esperado ?? {}).reduce((a, b) => a + (b ?? 0), 0);
                  const dec = Object.values(t.declarado ?? {}).reduce((a, b) => a + (b ?? 0), 0);
                  return <tr key={t.id} className="border-t border-line/60"><td className="py-2">{t.caja_nombre}</td><td className="text-right font-mono">{money(esp)}</td><td className="text-right font-mono">{money(dec)}</td><td className={cx("text-right font-mono", (t.diferencia_total ?? 0) === 0 ? "text-up" : "text-down")}>{money(t.diferencia_total ?? 0)}</td></tr>;
                })}
                {s.turnos.filter((t) => t.estado === "abierto").map((t) => <tr key={t.id} className="border-t border-line/60"><td className="py-2">{t.caja_nombre}</td><td colSpan={3} className="text-right text-xs text-mute">turno abierto desde {hhmm(t.apertura_at)}</td></tr>)}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
      <AiAssistantPanel />
    </div>
  );
}
