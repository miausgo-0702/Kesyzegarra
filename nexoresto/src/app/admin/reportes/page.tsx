"use client";
// Reportes de la jornada: cierre Z por medio de pago, ventas por mozo y por categoría,
// y el impacto del motor Exchange (cuánto se ganó o se dejó de ganar contra el precio base).
import { useMemo } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Shell } from "@/components/ui/Shell";
import { Kpi, Panel } from "@/components/ui/kit";
import { ExportBtns } from "@/components/ui/ExportBtns";
import { useNexo } from "@/lib/store/NexoProvider";
import { cx, hhmm, money, pct } from "@/lib/format";
import { importeItem, inicioTurnoOperativo } from "@/lib/store/selectors";
import type { MedioPago } from "@/lib/types";

const MEDIO: Record<MedioPago, string> = { efectivo: "Efectivo", debito: "Débito", credito: "Crédito", qr: "QR / billetera", transferencia: "Transferencia", cupon: "Cupón" };
const tooltip = { contentStyle: { background: "#0c1117", border: "1px solid #1e2a36", borderRadius: 12, fontSize: 12 }, cursor: { fill: "rgba(255,255,255,.04)" } };

export default function Reportes() {
  return <Shell roles={[]} titulo="Reportes de la jornada"><Tablero /></Shell>;
}

function Tablero() {
  const s = useNexo();
  const t0 = inicioTurnoOperativo().getTime();
  const data = useMemo(() => {
    const peds = s.pedidos.filter((p) => new Date(p.created_at).getTime() >= t0 && p.estado !== "anulado");
    const ids = new Set(peds.map((p) => p.id));
    const items = s.items.filter((i) => ids.has(i.pedido_id) && i.estado_cocina !== "anulado");
    const movs = s.movimientos.filter((m) => new Date(m.created_at).getTime() >= t0);

    const porMedio = (Object.keys(MEDIO) as MedioPago[]).map((m) => ({
      medio: MEDIO[m], cobrado: movs.filter((x) => x.medio === m && x.tipo === "cobro").reduce((a, x) => a + x.monto, 0),
      propinas: movs.filter((x) => x.medio === m && x.tipo === "propina").reduce((a, x) => a + x.monto, 0),
      operaciones: movs.filter((x) => x.medio === m && x.tipo === "cobro").length,
    })).filter((x) => x.cobrado || x.propinas);

    const porMozo = s.usuarios.filter((u) => u.rol === "mozo").map((u) => {
      const ps = peds.filter((p) => p.mozo_id === u.id);
      return { mozo: u.nombre, pedidos: ps.length, ventas: ps.reduce((a, p) => a + p.subtotal - p.descuento, 0), propinas: ps.reduce((a, p) => a + p.propina, 0) };
    }).concat([{ mozo: "Carta QR (sin mozo)", pedidos: peds.filter((p) => p.tipo === "webapp_qr").length, ventas: peds.filter((p) => p.tipo === "webapp_qr").reduce((a, p) => a + p.subtotal, 0), propinas: 0 }]);

    const porCategoria = s.categorias.map((c) => {
      const its = items.filter((i) => s.productos.find((p) => p.id === i.producto_id)?.categoria_id === c.id);
      return { categoria: c.nombre, ventas: its.reduce((a, i) => a + importeItem(i), 0), unidades: its.reduce((a, i) => a + i.cantidad, 0) };
    }).filter((x) => x.ventas).sort((a, b) => b.ventas - a.ventas);

    // Impacto del motor Exchange: precio cobrado vs precio base, por producto cotizable
    const exchange = s.productos.filter((p) => p.es_cotizable_bolsa).map((p) => {
      const its = items.filter((i) => i.producto_id === p.id);
      return { producto: p.nombre, unidades: its.reduce((a, i) => a + i.cantidad, 0), delta: its.reduce((a, i) => a + i.cantidad * (i.precio_unitario - p.precio_base), 0) };
    }).filter((x) => x.unidades).sort((a, b) => b.delta - a.delta);

    const ventas = items.reduce((a, i) => a + importeItem(i), 0);
    const anulados = s.auditoria.filter((a) => a.accion === "anulacion_item" && new Date(a.created_at).getTime() >= t0);
    const descuentos = peds.reduce((a, p) => a + p.descuento, 0);
    return { peds, ventas, porMedio, porMozo, porCategoria, exchange, anulados, descuentos, propinas: movs.filter((m) => m.tipo === "propina").reduce((a, m) => a + m.monto, 0) };
  }, [s, t0]);

  const deltaExchange = data.exchange.reduce((a, x) => a + x.delta, 0);
  const cobradoTotal = data.porMedio.reduce((a, x) => a + x.cobrado, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Ventas brutas" value={money(data.ventas)} delta={`${data.peds.length} pedidos desde ${hhmm(t0)}`} />
        <Kpi label="Cobrado en caja" value={money(cobradoTotal)} delta={`+ ${money(data.propinas)} de propinas`} />
        <Kpi label="Impacto del Exchange" value={<span className={deltaExchange >= 0 ? "text-up" : "text-down"}>{deltaExchange >= 0 ? "+" : ""}{money(deltaExchange)}</span>} delta={`${pct(data.ventas ? (deltaExchange / data.ventas) * 100 : 0)} vs. precio base`} tono={deltaExchange >= 0 ? "up" : "down"} hint="Diferencia entre lo cobrado y lo que se hubiera cobrado a precio base" />
        <Kpi label="Descuentos" value={money(data.descuentos)} delta="cupones y promos" tono="warn" />
        <Kpi label="Anulaciones" value={data.anulados.length} delta={money(data.anulados.reduce((a, x) => a + (x.monto ?? 0), 0))} tono="down" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Cierre Z · por medio de pago" action={<ExportBtns nombre="cierre-z" filas={() => data.porMedio.map((x) => ({ Medio: x.medio, Operaciones: x.operaciones, Cobrado: Math.round(x.cobrado), Propinas: Math.round(x.propinas) }))} />}>
          <table className="w-full text-sm">
            <thead><tr className="eyebrow text-left"><th className="py-2">Medio</th><th className="text-right">Operaciones</th><th className="text-right">Cobrado</th><th className="text-right">Propinas</th><th className="w-32 pl-4">Participación</th></tr></thead>
            <tbody>
              {data.porMedio.map((x) => (
                <tr key={x.medio} className="border-t border-line/60">
                  <td className="py-2.5">{x.medio}</td><td className="text-right font-mono">{x.operaciones}</td><td className="text-right font-mono">{money(x.cobrado)}</td><td className="text-right font-mono text-mute">{money(x.propinas)}</td>
                  <td className="pl-4"><div className="h-1.5 rounded-full bg-raised"><div className="h-full rounded-full bg-up" style={{ width: `${cobradoTotal ? (x.cobrado / cobradoTotal) * 100 : 0}%` }} /></div></td>
                </tr>
              ))}
              <tr className="border-t border-line font-semibold"><td className="py-2.5">Total</td><td className="text-right font-mono">{data.porMedio.reduce((a, x) => a + x.operaciones, 0)}</td><td className="text-right font-mono">{money(cobradoTotal)}</td><td className="text-right font-mono">{money(data.propinas)}</td><td /></tr>
            </tbody>
          </table>
        </Panel>

        <Panel title="Ventas por mozo" action={<ExportBtns nombre="ventas-por-mozo" filas={() => data.porMozo.map((x) => ({ Mozo: x.mozo, Pedidos: x.pedidos, Ventas: Math.round(x.ventas), Propinas: Math.round(x.propinas), "Ticket promedio": x.pedidos ? Math.round(x.ventas / x.pedidos) : 0 }))} />}>
          <table className="w-full text-sm">
            <thead><tr className="eyebrow text-left"><th className="py-2">Mozo</th><th className="text-right">Pedidos</th><th className="text-right">Ventas</th><th className="text-right">Ticket prom.</th><th className="text-right">Propinas</th></tr></thead>
            <tbody>
              {data.porMozo.map((x) => (
                <tr key={x.mozo} className="border-t border-line/60"><td className="py-2.5">{x.mozo}</td><td className="text-right font-mono">{x.pedidos}</td><td className="text-right font-mono">{money(x.ventas)}</td><td className="text-right font-mono text-mute">{money(x.pedidos ? x.ventas / x.pedidos : 0)}</td><td className="text-right font-mono text-up">{money(x.propinas)}</td></tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Ventas por categoría">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={data.porCategoria} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="categoria" width={120} tick={{ fill: "#c9d3dd", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => [money(Number(v)), "Ventas"]} {...tooltip} />
                <Bar dataKey="ventas" fill="#1ee08f" radius={[0, 6, 6, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Motor Exchange · cobrado vs. precio base" action={<ExportBtns nombre="impacto-exchange" filas={() => data.exchange.map((x) => ({ Producto: x.producto, Unidades: x.unidades, "Diferencia vs base": Math.round(x.delta) }))} />}>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={data.exchange.slice(0, 10)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <XAxis dataKey="producto" tick={{ fill: "#8a97a6", fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-25} textAnchor="end" height={56} />
                <YAxis tickFormatter={(v) => `${v >= 0 ? "" : "−"}$${Math.abs(Math.round(v / 1000))}k`} tick={{ fill: "#8a97a6", fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
                <Tooltip formatter={(v) => [money(Number(v)), "vs. precio base"]} {...tooltip} />
                <Bar dataKey="delta" radius={[6, 6, 0, 0]} barSize={22}>
                  {data.exchange.slice(0, 10).map((x) => <Cell key={x.producto} fill={x.delta >= 0 ? "#1ee08f" : "#ff4d5e"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className={cx("mt-2 text-xs", deltaExchange >= 0 ? "text-mute" : "text-warn")}>
            Las barras verdes son productos que se vendieron por encima de su precio base por la demanda; las rojas, los que bajaron para rotar. El piso de margen evita vender a pérdida.
          </p>
        </Panel>
      </div>
    </div>
  );
}
