"use client";
// Gestión de la carta: precios base, rango del motor Exchange (piso/tope), receta,
// disponibilidad ("86") y destacados. Todo cambio queda auditado.
import { useMemo, useState } from "react";
import { Ban, CircleCheck, Pencil, Plus, Search, Star, TrendingUp, Trash2 } from "lucide-react";
import { Shell } from "@/components/ui/Shell";
import { Badge, Btn, Field, Modal, Panel, Segmented, inputCls, toast } from "@/components/ui/kit";
import { ExportBtns } from "@/components/ui/ExportBtns";
import { ICONOS_DISPONIBLES, ProductIcon } from "@/components/icons/ProductIcon";
import { useDispatch, useNexo, useSesion } from "@/lib/store/NexoProvider";
import { cx, money } from "@/lib/format";
import { costoProducto, disponible } from "@/lib/store/selectors";
import { pisoEfectivo } from "@/lib/exchangeEngine";
import type { Producto } from "@/lib/types";

export default function Carta() {
  return <Shell roles={[]} titulo="Carta y precios"><Gestion /></Shell>;
}

type Borrador = { id?: string; nombre: string; descripcion: string; categoria_id: string; icono: string; precio_base: number; precio_minimo: number; precio_maximo: number; es_cotizable_bolsa: boolean; destacado: boolean; tiempo_objetivo_min: number; objetivo_ventana: number; receta: { insumo_id: string; cantidad: number }[] };

function Gestion() {
  const s = useNexo();
  const dispatch = useDispatch();
  const sesion = useSesion();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("todas");
  const [edit, setEdit] = useState<Borrador | null>(null);

  const filas = useMemo(() => s.productos
    .filter((p) => (cat === "todas" || p.categoria_id === cat) && p.nombre.toLowerCase().includes(q.toLowerCase()))
    .map((p) => ({ p, costo: costoProducto(s, p.id), ok: disponible(s, p) })), [s, q, cat]);

  const abrir = (p?: Producto) => setEdit(p ? {
    id: p.id, nombre: p.nombre, descripcion: p.descripcion, categoria_id: p.categoria_id, icono: p.icono, precio_base: p.precio_base, precio_minimo: p.precio_minimo,
    precio_maximo: p.precio_maximo, es_cotizable_bolsa: p.es_cotizable_bolsa, destacado: p.destacado, tiempo_objetivo_min: p.tiempo_objetivo_min, objetivo_ventana: p.objetivo_ventana,
    receta: s.recetas.filter((r) => r.producto_id === p.id).map((r) => ({ insumo_id: r.insumo_id, cantidad: r.cantidad })),
  } : { nombre: "", descripcion: "", categoria_id: s.categorias[0].id, icono: "burger", precio_base: 0, precio_minimo: 0, precio_maximo: 0, es_cotizable_bolsa: true, destacado: false, tiempo_objetivo_min: 10, objetivo_ventana: 2, receta: [] });

  async function guardar() {
    if (!edit) return;
    const { receta, ...prod } = edit;
    const e = await dispatch({ type: "guardarProducto", producto: prod, receta, usuario: sesion?.nombre });
    if (e) return toast(e, "down");
    toast(edit.id ? `${edit.nombre} actualizado` : `${edit.nombre} agregado a la carta`);
    setEdit(null);
  }

  const costoBorrador = edit ? Math.round(edit.receta.reduce((a, r) => a + r.cantidad * (s.insumos.find((i) => i.id === r.insumo_id)?.costo_unitario ?? 0), 0)) : 0;
  const pisoBorrador = edit ? pisoEfectivo({ precio_minimo: edit.precio_minimo }, costoBorrador, s.bar.reglas_precios) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" /><input id="buscar-carta" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la carta" className={cx(inputCls, "w-56 pl-9")} /></div>
        <Segmented value={cat} onChange={setCat} options={[{ value: "todas", label: "Todas" }, ...s.categorias.map((c) => ({ value: c.id, label: c.nombre }))]} className="overflow-x-auto" />
        <span className="flex-1" />
        <ExportBtns nombre="carta" filas={() => filas.map(({ p, costo }) => ({ Producto: p.nombre, Categoría: s.categorias.find((c) => c.id === p.categoria_id)?.nombre, "Precio base": p.precio_base, "Precio actual": p.precio_actual, Mínimo: p.precio_minimo, Máximo: p.precio_maximo, Costo: costo, "Margen %": Math.round((1 - costo / p.precio_actual) * 100), Cotiza: p.es_cotizable_bolsa ? "sí" : "no", Agotado: p.agotado ? "sí" : "no" }))} />
        <Btn variant="primary" onClick={() => abrir()}><Plus size={16} />Nuevo producto</Btn>
      </div>

      <Panel pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="eyebrow text-left"><th className="px-4 py-3">Producto</th><th>Precio actual</th><th>Rango Exchange</th><th className="text-right">Costo</th><th className="text-right">Margen</th><th className="pl-4">Estado</th><th className="pr-4 text-right">Acciones</th></tr></thead>
            <tbody>
              {filas.map(({ p, costo, ok }) => {
                const margen = (1 - costo / p.precio_actual) * 100;
                const pos = p.precio_maximo > p.precio_minimo ? ((p.precio_actual - p.precio_minimo) / (p.precio_maximo - p.precio_minimo)) * 100 : 50;
                return (
                  <tr key={p.id} className="border-t border-line/60 transition-colors hover:bg-raised/40">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <ProductIcon icono={p.icono} size={44} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-semibold">{p.nombre}{p.destacado && <Star size={13} className="fill-warn text-warn" aria-label="Destacado en la TV" />}</div>
                          <div className="truncate text-xs text-mute">{s.categorias.find((c) => c.id === p.categoria_id)?.nombre} · {p.estacion}</div>
                        </div>
                      </div>
                    </td>
                    <td className="font-mono">{money(p.precio_actual)} <span className={cx("text-xs", p.variacion_porcentaje >= 0 ? "text-up" : "text-down")}>{p.variacion_porcentaje >= 0 ? "▲" : "▼"}{Math.abs(p.variacion_porcentaje).toFixed(1).replace(".", ",")}%</span></td>
                    <td className="w-56 pr-6">
                      {p.es_cotizable_bolsa ? (
                        <div>
                          <div className="relative h-1.5 rounded-full bg-raised"><div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-up" style={{ left: `${Math.min(Math.max(pos, 0), 100)}%` }} /></div>
                          <div className="mt-1 flex justify-between font-mono text-[11px] text-mute"><span>{money(p.precio_minimo)}</span><span>{money(p.precio_maximo)}</span></div>
                        </div>
                      ) : <span className="text-xs text-mute">Precio fijo</span>}
                    </td>
                    <td className="text-right font-mono text-mute">{money(costo)}</td>
                    <td className={cx("text-right font-mono", margen >= 70 ? "text-up" : margen >= 55 ? "text-warn" : "text-down")}>{Math.round(margen)}%</td>
                    <td className="pl-4">{p.agotado ? <Badge tono="down">Agotado (86)</Badge> : !ok ? <Badge tono="warn">Sin insumos</Badge> : <Badge tono="up">A la venta</Badge>}</td>
                    <td className="pr-4">
                      <span className="flex justify-end gap-1.5">
                        <Btn size="sm" variant={p.agotado ? "primary" : "ghost"} onClick={async () => { await dispatch({ type: "toggleAgotado", producto_id: p.id, usuario: sesion?.nombre }); toast(p.agotado ? `${p.nombre} vuelve a la venta` : `${p.nombre} marcado agotado en POS, carta QR y TV`, p.agotado ? "up" : "warn"); }}>
                          {p.agotado ? <CircleCheck size={14} /> : <Ban size={14} />}{p.agotado ? "Reponer" : "86"}
                        </Btn>
                        <Btn size="sm" onClick={() => abrir(p)} aria-label={`Editar ${p.nombre}`}><Pencil size={14} />Editar</Btn>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal open={!!edit} onClose={() => setEdit(null)} wide title={edit?.id ? `Editar · ${edit.nombre}` : "Nuevo producto"}
        footer={<div className="flex items-center justify-between gap-2"><span className="text-xs text-mute">Los cambios de precio quedan en auditoría.</span><span className="flex gap-2"><Btn onClick={() => setEdit(null)}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Guardar</Btn></span></div>}>
        {edit && (
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="space-y-3">
              <div className="flex gap-3">
                <ProductIcon icono={edit.icono} size={88} />
                <div className="flex-1 space-y-3">
                  <Field label="Nombre"><input id="prod-nombre" value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} className={inputCls} /></Field>
                  <Field label="Categoría"><select id="prod-cat" value={edit.categoria_id} onChange={(e) => setEdit({ ...edit, categoria_id: e.target.value })} className={inputCls}>{s.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.estacion}</option>)}</select></Field>
                </div>
              </div>
              <Field label="Descripción en la carta"><input id="prod-desc" value={edit.descripcion} onChange={(e) => setEdit({ ...edit, descripcion: e.target.value })} className={inputCls} /></Field>
              <Field label="Foto">
                <div className="flex flex-wrap gap-1.5">
                  {ICONOS_DISPONIBLES.map((ic) => (
                    <button key={ic} type="button" onClick={() => setEdit({ ...edit, icono: ic })} className={cx("press rounded-lg p-0.5", edit.icono === ic ? "ring-2 ring-up" : "ring-1 ring-line")} aria-label={ic}><ProductIcon icono={ic} size={38} /></button>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Precio base"><input id="prod-base" type="number" min={0} step={50} value={edit.precio_base || ""} onChange={(e) => { const b = Number(e.target.value); setEdit({ ...edit, precio_base: b, precio_minimo: edit.id ? edit.precio_minimo : Math.round((b * 0.75) / 50) * 50, precio_maximo: edit.id ? edit.precio_maximo : Math.round((b * 1.4) / 50) * 50 }); }} className={inputCls} /></Field>
                <Field label="Mínimo (piso)"><input id="prod-min" type="number" min={0} step={50} value={edit.precio_minimo || ""} disabled={!edit.es_cotizable_bolsa} onChange={(e) => setEdit({ ...edit, precio_minimo: Number(e.target.value) })} className={inputCls} /></Field>
                <Field label="Máximo (tope)"><input id="prod-max" type="number" min={0} step={50} value={edit.precio_maximo || ""} disabled={!edit.es_cotizable_bolsa} onChange={(e) => setEdit({ ...edit, precio_maximo: Number(e.target.value) })} className={inputCls} /></Field>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={edit.es_cotizable_bolsa} onChange={(e) => setEdit({ ...edit, es_cotizable_bolsa: e.target.checked })} /><TrendingUp size={15} className="text-up" />Cotiza en la bolsa</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={edit.destacado} onChange={(e) => setEdit({ ...edit, destacado: e.target.checked })} /><Star size={15} className="text-warn" />Destacado en la TV</label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Objetivo de ventas por ventana"><input id="prod-obj" type="number" min={0} value={edit.objetivo_ventana} onChange={(e) => setEdit({ ...edit, objetivo_ventana: Number(e.target.value) })} className={inputCls} /></Field>
                <Field label="Tiempo objetivo en cocina (min)"><input id="prod-tiempo" type="number" min={1} value={edit.tiempo_objetivo_min} onChange={(e) => setEdit({ ...edit, tiempo_objetivo_min: Number(e.target.value) })} className={inputCls} /></Field>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">Receta (escandallo)</span><Btn size="sm" onClick={() => setEdit({ ...edit, receta: [...edit.receta, { insumo_id: s.insumos[0].id, cantidad: 0 }] })}><Plus size={13} />Insumo</Btn></div>
              <ul className="space-y-2">
                {edit.receta.map((r, i) => {
                  const ins = s.insumos.find((x) => x.id === r.insumo_id);
                  return (
                    <li key={i} className="flex items-center gap-2">
                      <select value={r.insumo_id} onChange={(e) => setEdit({ ...edit, receta: edit.receta.map((x, j) => (j === i ? { ...x, insumo_id: e.target.value } : x)) })} className={cx(inputCls, "h-10 flex-1")}>{s.insumos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
                      <input type="number" min={0} step="any" value={r.cantidad || ""} onChange={(e) => setEdit({ ...edit, receta: edit.receta.map((x, j) => (j === i ? { ...x, cantidad: Number(e.target.value) } : x)) })} className={cx(inputCls, "h-10 w-24 text-right")} aria-label="Cantidad" />
                      <span className="w-8 text-xs text-mute">{ins?.unidad}</span>
                      <span className="w-16 text-right font-mono text-xs">{money(r.cantidad * (ins?.costo_unitario ?? 0))}</span>
                      <button onClick={() => setEdit({ ...edit, receta: edit.receta.filter((_, j) => j !== i) })} className="press grid h-9 w-9 place-items-center rounded-lg text-mute hover:bg-raised hover:text-down" aria-label="Quitar"><Trash2 size={14} /></button>
                    </li>
                  );
                })}
                {!edit.receta.length && <li className="rounded-xl border border-dashed border-line p-4 text-sm text-mute">Sin receta: el stock no se descuenta y el margen no se puede calcular. Agregá los insumos con su cantidad por porción.</li>}
              </ul>
              <dl className="mt-4 grid grid-cols-3 gap-3 rounded-xl border border-line bg-bg/60 p-3 text-sm">
                <div><dt className="text-xs text-mute">Costo por porción</dt><dd className="font-mono text-lg">{money(costoBorrador)}</dd></div>
                <div><dt className="text-xs text-mute">Margen a precio base</dt><dd className={cx("font-mono text-lg", edit.precio_base && (1 - costoBorrador / edit.precio_base) * 100 >= 65 ? "text-up" : "text-warn")}>{edit.precio_base ? `${Math.round((1 - costoBorrador / edit.precio_base) * 100)}%` : "—"}</dd></div>
                <div><dt className="text-xs text-mute">Piso real (costo × {s.bar.reglas_precios.margen_piso.toLocaleString("es-AR")})</dt><dd className="font-mono text-lg text-warn">{money(pisoBorrador)}</dd></div>
              </dl>
              {edit.es_cotizable_bolsa && pisoBorrador > edit.precio_minimo && <p className="mt-2 text-xs text-warn">El costo de la receta sube el piso por encima del mínimo cargado: el motor nunca bajará de {money(pisoBorrador)}.</p>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
