"use client";
// FASE 6.1 · Control de stock, recetas (escandallos) y compras a proveedores.
import { useMemo, useState } from "react";
import { PackagePlus, Search, Send, Trash, Sparkles } from "lucide-react";
import { Shell } from "@/components/ui/Shell";
import { Badge, Btn, Field, Modal, Panel, Segmented, inputCls, toast } from "@/components/ui/kit";
import { ExportBtns } from "@/components/ui/ExportBtns";
import { ProductIcon } from "@/components/icons/ProductIcon";
import { useDispatch, useNexo, useSesion } from "@/lib/store/NexoProvider";
import { cantidad, cx, money } from "@/lib/format";
import { costoProducto, nivelStock } from "@/lib/store/selectors";
import { calcularSugerenciasCompra } from "@/lib/ai/learningEngine";
import { pisoEfectivo } from "@/lib/exchangeEngine";

export default function Stock() {
  return <Shell roles={[]} titulo="Stock, recetas y compras"><Gestion /></Shell>;
}

function Gestion() {
  const s = useNexo();
  const dispatch = useDispatch();
  const sesion = useSesion();
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "alertas">("todos");
  const [prodSel, setProdSel] = useState(s.productos[0]?.id);
  const [modal, setModal] = useState<null | "compra" | "merma">(null);
  const [form, setForm] = useState({ insumo_id: s.insumos[0]?.id ?? "", cantidad: "", costo: "", motivo: "vencimiento" as "vencimiento" | "rotura" | "error" | "otro" });
  const sug = useMemo(() => calcularSugerenciasCompra(s, 4), [s]);
  const insumos = s.insumos.filter((i) => (filtro === "todos" || nivelStock(i) !== "ok") && i.nombre.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => ({ critico: 0, bajo: 1, ok: 2 }[nivelStock(a)] - { critico: 0, bajo: 1, ok: 2 }[nivelStock(b)]));
  const criticos = s.insumos.filter((i) => nivelStock(i) === "critico").length;
  const bajos = s.insumos.filter((i) => nivelStock(i) === "bajo").length;
  const prod = s.productos.find((p) => p.id === prodSel)!;
  const costo = costoProducto(s, prod.id);
  const porProveedor = sug.reduce<Record<string, typeof sug>>((acc, x) => ({ ...acc, [x.proveedor]: [...(acc[x.proveedor] ?? []), x] }), {});

  async function guardar() {
    const insumo = s.insumos.find((i) => i.id === form.insumo_id)!;
    const cant = Number(form.cantidad);
    const e = modal === "compra"
      ? await dispatch({ type: "compraInsumo", insumo_id: insumo.id, cantidad: cant, costo_unitario: Number(form.costo) || insumo.costo_unitario, usuario: sesion?.nombre })
      : await dispatch({ type: "registrarMerma", insumo_id: insumo.id, cantidad: cant, motivo: form.motivo, usuario: sesion?.nombre });
    if (e) return toast(e, "down");
    toast(modal === "compra" ? "Compra cargada · costo promedio actualizado" : "Merma registrada");
    setModal(null);
    setForm({ ...form, cantidad: "", costo: "" });
  }

  return (
    <div className="grid gap-4 2xl:grid-cols-[1.6fr_1fr]">
      <Panel pad={false}>
        <header className="flex flex-wrap items-center gap-2 border-b border-line p-4">
          <h2 className="eyebrow mr-2">Inventario por ingrediente</h2>
          <Badge tono="down">{criticos} críticos</Badge><Badge tono="warn">{bajos} bajos</Badge>
          <span className="flex-1" />
          <div className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mute" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className={cx(inputCls, "h-9 w-40 pl-8")} /></div>
          <Segmented value={filtro} onChange={setFiltro} options={[{ value: "todos", label: "Todos" }, { value: "alertas", label: "Alertas" }]} />
          <ExportBtns nombre="stock" filas={() => s.insumos.map((i) => ({ Insumo: i.nombre, Rubro: i.rubro, Unidad: i.unidad, Stock: i.stock_actual, Mínimo: i.stock_minimo, Estado: nivelStock(i), "Costo unitario": i.costo_unitario, "Valor stock": Math.round(i.stock_actual * i.costo_unitario), Proveedor: i.proveedor }))} />
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="eyebrow text-left"><th className="px-4 py-2">Ingrediente</th><th>Rubro</th><th className="text-right">Actual</th><th className="text-right">Mínimo</th><th className="w-40 px-4">Nivel</th><th>Estado</th><th className="text-right pr-4">Costo u.</th></tr></thead>
            <tbody>
              {insumos.map((i) => {
                const n = nivelStock(i);
                const ratio = Math.min(i.stock_actual / Math.max(i.stock_minimo * 2, 1), 1);
                return (
                  <tr key={i.id} className="border-t border-line/60">
                    <td className="px-4 py-2.5 font-semibold">{i.nombre}</td>
                    <td className="text-mute">{i.rubro}</td>
                    <td className="text-right font-mono">{cantidad(i.stock_actual, i.unidad)}</td>
                    <td className="text-right font-mono text-mute">{cantidad(i.stock_minimo, i.unidad)}</td>
                    <td className="px-4"><div className="h-2 overflow-hidden rounded-full bg-raised"><div className={cx("h-full rounded-full", n === "critico" ? "bg-down" : n === "bajo" ? "bg-warn" : "bg-up")} style={{ width: `${Math.max(ratio * 100, 4)}%` }} /></div></td>
                    <td><Badge tono={n === "critico" ? "down" : n === "bajo" ? "warn" : "up"}>{n === "critico" ? "Crítico" : n === "bajo" ? "Bajo" : "OK"}</Badge></td>
                    <td className="pr-4 text-right font-mono text-mute">{money(i.costo_unitario)}{i.costo_unitario < 1 ? <span className="text-[10px]"> ({i.costo_unitario.toLocaleString("es-AR")})</span> : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line p-4">
          <Btn variant="primary" onClick={() => setModal("compra")}><PackagePlus size={16} />Cargar compra</Btn>
          <Btn onClick={() => setModal("merma")}><Trash size={16} />Registrar merma</Btn>
        </div>
      </Panel>

      <div className="flex flex-col gap-4">
        <Panel title={`Receta · ${prod.nombre} (escandallo)`} action={<select value={prodSel} onChange={(e) => setProdSel(e.target.value)} className="h-8 rounded-lg border border-line bg-bg px-2 text-xs">{s.productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>}>
          <div className="mb-3 flex items-center gap-3"><ProductIcon icono={prod.icono} size={48} /><p className="text-xs text-mute">{prod.descripcion}</p></div>
          <table className="w-full text-sm">
            <tbody>
              {s.recetas.filter((r) => r.producto_id === prod.id).map((r) => { const i = s.insumos.find((x) => x.id === r.insumo_id)!; return (
                <tr key={r.insumo_id} className="border-t border-line/60"><td className="py-1.5">{i.nombre}</td><td className="text-right font-mono text-mute">{r.cantidad.toLocaleString("es-AR")} {i.unidad}</td><td className="text-right font-mono">{money(r.cantidad * i.costo_unitario)}</td></tr>
              ); })}
              <tr className="border-t border-line font-semibold"><td className="py-1.5">Costo total</td><td /><td className="text-right font-mono">{money(costo)}</td></tr>
              <tr><td className="py-1">Precio actual</td><td /><td className="text-right font-mono text-up">{money(prod.precio_actual)}</td></tr>
              <tr className="text-mute"><td className="py-1">Piso Exchange (costo × 1,35)</td><td /><td className="text-right font-mono">{money(pisoEfectivo(prod, costo, s.bar.reglas_precios))}</td></tr>
            </tbody>
          </table>
          <div className="mt-2 font-mono text-sm text-up">Margen {(100 * (1 - costo / prod.precio_actual)).toFixed(1).replace(".", ",")} %</div>
        </Panel>

        <Panel title="Orden de compra sugerida (IA · 4 días)" action={<Sparkles size={14} className="text-violet" />}>
          {!sug.length && <p className="text-sm text-mute">Stock suficiente para la demanda proyectada.</p>}
          {Object.entries(porProveedor).map(([prov, items]) => (
            <div key={prov} className="mb-3">
              <div className="mb-1 flex items-center justify-between text-xs"><span className="font-semibold">{prov}</span><span className="font-mono text-mute">{money(items.reduce((a, x) => a + x.costo_estimado, 0))}</span></div>
              <ul className="space-y-1 text-sm">{items.map((x) => <li key={x.insumo_id} className="flex justify-between"><span>{x.insumo}</span><span className="font-mono text-mute">{cantidad(x.sugerido, x.unidad)}</span></li>)}</ul>
            </div>
          ))}
          {sug.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <Btn variant="primary" onClick={async () => { for (const x of sug) await dispatch({ type: "compraInsumo", insumo_id: x.insumo_id, cantidad: x.sugerido, costo_unitario: s.insumos.find((i) => i.id === x.insumo_id)!.costo_unitario, usuario: sesion?.nombre }); toast("Orden recibida y cargada al stock"); }}>Marcar recibida</Btn>
              <Btn onClick={() => {
                const txt = Object.entries(porProveedor).map(([p, xs]) => `*${p}*\n${xs.map((x) => `• ${x.insumo}: ${cantidad(x.sugerido, x.unidad)}`).join("\n")}`).join("\n\n");
                window.open(`https://wa.me/?text=${encodeURIComponent(`Pedido ${s.bar.nombre}\n\n${txt}`)}`, "_blank", "noopener");
              }}><Send size={14} />Enviar a proveedores</Btn>
            </div>
          )}
          <p className="mt-2 text-[11px] text-dim">Confianza: {sug[0]?.confianza ?? "—"} · proyección por mismo día de la semana (8 semanas) o ritmo actual.</p>
        </Panel>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal === "compra" ? "Carga rápida de compra" : "Registrar merma"} footer={<div className="flex justify-end gap-2"><Btn onClick={() => setModal(null)}>Cancelar</Btn><Btn variant="primary" onClick={guardar} disabled={!Number(form.cantidad)}>Guardar</Btn></div>}>
        <div className="space-y-3">
          <Field label="Insumo"><select value={form.insumo_id} onChange={(e) => setForm({ ...form, insumo_id: e.target.value })} className={inputCls}>{s.insumos.map((i) => <option key={i.id} value={i.id}>{i.nombre} ({i.unidad})</option>)}</select></Field>
          <Field label={`Cantidad (${s.insumos.find((i) => i.id === form.insumo_id)?.unidad})`}><input inputMode="decimal" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value.replace(",", ".") })} className={inputCls} /></Field>
          {modal === "compra"
            ? <Field label="Costo unitario (vacío = el actual)"><input inputMode="decimal" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value.replace(",", ".") })} className={inputCls} placeholder={String(s.insumos.find((i) => i.id === form.insumo_id)?.costo_unitario)} /></Field>
            : <Field label="Motivo"><select value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value as typeof form.motivo })} className={inputCls}><option value="vencimiento">Vencimiento</option><option value="rotura">Rotura</option><option value="error">Error de preparación</option><option value="otro">Otro</option></select></Field>}
          <p className="text-xs text-mute">{modal === "compra" ? "La compra actualiza el costo promedio ponderado del insumo y, con él, el piso del motor Exchange." : "La merma descuenta stock y se resta de la ganancia neta del día. Queda auditada."}</p>
        </div>
      </Modal>
    </div>
  );
}
