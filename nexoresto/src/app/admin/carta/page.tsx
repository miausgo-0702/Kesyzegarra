"use client";
// Editor de la carta del bar: categorías, productos, fotos propias, precios y rango del
// Exchange, receta (escandallo), modificadores y disponibilidad. Cada bar tiene la suya.
import { useMemo, useRef, useState } from "react";
import {
  Archive, ArchiveRestore, ArrowDown, ArrowUp, Ban, Camera, Check, CircleCheck, Copy, ImagePlus, Martini, Pencil, Plus, Search, Star, Trash2, TrendingUp, UtensilsCrossed, X,
} from "lucide-react";
import { Shell } from "@/components/ui/Shell";
import { Badge, Btn, Empty, Field, Modal, Segmented, inputCls, toast } from "@/components/ui/kit";
import { ExportBtns } from "@/components/ui/ExportBtns";
import { ICONOS_DISPONIBLES, ProductIcon, comprimirFoto, esFotoPropia } from "@/components/icons/ProductIcon";
import { useDispatch, useNexo, useSesion } from "@/lib/store/NexoProvider";
import { cx, money } from "@/lib/format";
import { costoProducto, disponible } from "@/lib/store/selectors";
import { pisoEfectivo } from "@/lib/exchangeEngine";
import type { Estacion, Producto } from "@/lib/types";

export default function Carta() {
  return <Shell roles={[]} titulo="Carta y precios" full><Editor /></Shell>;
}

interface ModBorrador { grupo: string; nombre: string; precio_extra: number; exclusivo: boolean }
interface Borrador {
  id?: string; nombre: string; descripcion: string; categoria_id: string; icono: string; precio_base: number; precio_minimo: number; precio_maximo: number;
  es_cotizable_bolsa: boolean; destacado: boolean; tiempo_objetivo_min: number; objetivo_ventana: number;
  receta: { insumo_id: string; cantidad: number }[]; mods: ModBorrador[];
}

function Editor() {
  const s = useNexo();
  const dispatch = useDispatch();
  const sesion = useSesion();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("todas");
  const [edit, setEdit] = useState<Borrador | null>(null);
  const [catEdit, setCatEdit] = useState<{ id?: string; nombre: string; estacion: Estacion } | null>(null);

  const categorias = [...s.categorias].sort((a, b) => a.orden - b.orden);
  const visibles = useMemo(() => s.productos
    .filter((p) => (cat === "archivados" ? !p.activo : p.activo) && (cat === "todas" || cat === "archivados" || p.categoria_id === cat) && p.nombre.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (categorias.findIndex((c) => c.id === a.categoria_id) - categorias.findIndex((c) => c.id === b.categoria_id)) || a.nombre.localeCompare(b.nombre)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [s.productos, cat, q, s.categorias]);
  const archivados = s.productos.filter((p) => !p.activo).length;

  const abrir = (p?: Producto) => setEdit(p ? {
    id: p.id, nombre: p.nombre, descripcion: p.descripcion, categoria_id: p.categoria_id, icono: p.icono, precio_base: p.precio_base, precio_minimo: p.precio_minimo,
    precio_maximo: p.precio_maximo, es_cotizable_bolsa: p.es_cotizable_bolsa, destacado: p.destacado, tiempo_objetivo_min: p.tiempo_objetivo_min, objetivo_ventana: p.objetivo_ventana,
    receta: s.recetas.filter((r) => r.producto_id === p.id).map((r) => ({ insumo_id: r.insumo_id, cantidad: r.cantidad })),
    mods: s.modificadores.filter((m) => m.producto_id === p.id).map((m) => ({ grupo: m.grupo, nombre: m.nombre, precio_extra: m.precio_extra, exclusivo: m.exclusivo })),
  } : {
    nombre: "", descripcion: "", categoria_id: cat !== "todas" && cat !== "archivados" ? cat : categorias[0]?.id ?? "", icono: "burger", precio_base: 0, precio_minimo: 0, precio_maximo: 0,
    es_cotizable_bolsa: true, destacado: false, tiempo_objetivo_min: 10, objetivo_ventana: 2, receta: [], mods: [],
  });

  async function guardar() {
    if (!edit) return;
    const { receta, mods, ...prod } = edit;
    if (!prod.categoria_id) return toast("Creá una categoría primero", "warn");
    const e = await dispatch({ type: "guardarProducto", producto: prod, receta, modificadores: mods, usuario: sesion?.nombre });
    if (e) return toast(e, "down");
    toast(prod.id ? `${prod.nombre} actualizado` : `${prod.nombre} agregado a la carta`);
    setEdit(null);
  }

  async function guardarCategoria() {
    if (!catEdit) return;
    const e = await dispatch({ type: "guardarCategoria", categoria: catEdit });
    if (e) return toast(e, "down");
    setCatEdit(null);
  }

  return (
    <div className="grid min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[260px_1fr]">
      {/* ---------- Categorías ---------- */}
      <aside className="border-b border-line bg-panel/40 p-3 lg:border-b-0 lg:border-r">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold">Categorías</h2>
          <button onClick={() => setCatEdit({ nombre: "", estacion: "cocina" })} className="press grid h-8 w-8 place-items-center rounded-lg text-mute hover:bg-raised hover:text-up" aria-label="Nueva categoría"><Plus size={16} /></button>
        </div>
        <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          <CatItem activo={cat === "todas"} onClick={() => setCat("todas")} nombre="Toda la carta" n={s.productos.filter((p) => p.activo).length} />
          {categorias.map((c, i) => (
            <div key={c.id} className="group relative">
              <CatItem activo={cat === c.id} onClick={() => setCat(c.id)} nombre={c.nombre} n={s.productos.filter((p) => p.activo && p.categoria_id === c.id).length}
                icono={c.estacion === "barra" ? <Martini size={14} /> : <UtensilsCrossed size={14} />} />
              <span className="absolute right-1 top-1/2 hidden -translate-y-1/2 gap-0.5 rounded-lg bg-panel lg:group-hover:flex">
                <button onClick={() => dispatch({ type: "moverCategoria", id: c.id, delta: -1 })} disabled={i === 0} className="grid h-7 w-7 place-items-center rounded-md text-mute hover:bg-raised hover:text-ink disabled:opacity-30" aria-label="Subir"><ArrowUp size={13} /></button>
                <button onClick={() => dispatch({ type: "moverCategoria", id: c.id, delta: 1 })} disabled={i === categorias.length - 1} className="grid h-7 w-7 place-items-center rounded-md text-mute hover:bg-raised hover:text-ink disabled:opacity-30" aria-label="Bajar"><ArrowDown size={13} /></button>
                <button onClick={() => setCatEdit({ id: c.id, nombre: c.nombre, estacion: c.estacion })} className="grid h-7 w-7 place-items-center rounded-md text-mute hover:bg-raised hover:text-ink" aria-label="Editar categoría"><Pencil size={13} /></button>
              </span>
            </div>
          ))}
          {archivados > 0 && <CatItem activo={cat === "archivados"} onClick={() => setCat("archivados")} nombre="Archivados" n={archivados} icono={<Archive size={14} />} />}
        </nav>
      </aside>

      {/* ---------- Productos ---------- */}
      <section className="min-w-0 p-4 lg:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-xl font-bold">{cat === "todas" ? "Toda la carta" : cat === "archivados" ? "Archivados" : categorias.find((c) => c.id === cat)?.nombre}</h1>
          <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" /><input id="buscar-carta" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto" className={cx(inputCls, "h-10 w-52 pl-9")} /></div>
          <ExportBtns nombre="carta" filas={() => s.productos.filter((p) => p.activo).map((p) => ({ Producto: p.nombre, Categoría: s.categorias.find((c) => c.id === p.categoria_id)?.nombre, Descripción: p.descripcion, "Precio base": p.precio_base, "Precio actual": p.precio_actual, Mínimo: p.precio_minimo, Máximo: p.precio_maximo, Costo: costoProducto(s, p.id), Agotado: p.agotado ? "sí" : "no" }))} />
          <Btn variant="primary" onClick={() => abrir()} disabled={!categorias.length}><Plus size={16} />Nuevo producto</Btn>
        </div>

        {!s.productos.length ? (
          <div className="grid place-items-center rounded-3xl border border-dashed border-line px-6 py-16 text-center">
            <UtensilsCrossed size={34} className="text-mute" />
            <h2 className="mt-3 text-lg font-semibold">Tu carta está vacía</h2>
            <p className="mt-1 max-w-sm text-sm text-mute">Cargá tus productos uno por uno con su foto, precio y receta, o empezá con una carta de ejemplo y editala.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Btn variant="primary" onClick={() => abrir()} disabled={!categorias.length}><Plus size={16} />Cargar el primer producto</Btn>
              <Btn onClick={async () => { await dispatch({ type: "importarCartaEjemplo" }); toast("Carta de ejemplo cargada: editala a tu gusto"); }}>Usar carta de ejemplo</Btn>
            </div>
          </div>
        ) : !visibles.length ? (
          <Empty title="No hay productos acá" hint={q ? "Probá con otra búsqueda." : "Agregá uno con Nuevo producto."} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibles.map((p) => {
              const costo = costoProducto(s, p.id);
              const margen = p.precio_actual ? (1 - costo / p.precio_actual) * 100 : 0;
              const ok = disponible(s, p);
              return (
                <li key={p.id} className="lift group flex flex-col overflow-hidden rounded-2xl border border-line bg-card">
                  <button onClick={() => abrir(p)} className="relative block text-left" aria-label={`Editar ${p.nombre}`}>
                    <ProductIcon icono={p.icono} size="full" alt={p.nombre} className="!aspect-[16/10] !rounded-none" />
                    <span className="absolute left-2 top-2 flex gap-1">
                      {!p.activo ? <Badge tono="mute" className="bg-black/70">Archivado</Badge> : p.agotado ? <Badge tono="down" className="bg-black/70">Agotado</Badge> : !ok ? <Badge tono="warn" className="bg-black/70">Sin insumos</Badge> : null}
                      {p.destacado && <Badge tono="warn" className="bg-black/70"><Star size={10} />TV</Badge>}
                    </span>
                  </button>
                  <div className="flex flex-1 flex-col p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{p.nombre}</div>
                        <div className="truncate text-xs text-mute">{p.descripcion || "Sin descripción"}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-semibold">{money(p.precio_actual)}</div>
                        {p.es_cotizable_bolsa ? <div className={cx("font-mono text-[11px]", p.variacion_porcentaje >= 0 ? "text-up" : "text-down")}>{p.variacion_porcentaje >= 0 ? "▲" : "▼"} {Math.abs(p.variacion_porcentaje).toFixed(1).replace(".", ",")}%</div> : <div className="text-[11px] text-mute">precio fijo</div>}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-mute">
                      <span>Costo <b className="font-mono text-ink/80">{costo ? money(costo) : "—"}</b></span>
                      <span>Margen <b className={cx("font-mono", !costo ? "text-mute" : margen >= 70 ? "text-up" : margen >= 55 ? "text-warn" : "text-down")}>{costo ? `${Math.round(margen)}%` : "—"}</b></span>
                    </div>
                    <div className="mt-3 flex gap-1.5 border-t border-line pt-3">
                      {p.activo ? (
                        <>
                          <Btn size="sm" variant={p.agotado ? "primary" : "ghost"} onClick={async () => { await dispatch({ type: "toggleAgotado", producto_id: p.id, usuario: sesion?.nombre }); toast(p.agotado ? `${p.nombre} vuelve a la venta` : `${p.nombre} agotado en caja, salón y carta QR`, p.agotado ? "up" : "warn"); }}>
                            {p.agotado ? <CircleCheck size={13} /> : <Ban size={13} />}{p.agotado ? "Reponer" : "Agotar"}
                          </Btn>
                          <Btn size="sm" onClick={() => abrir(p)}><Pencil size={13} />Editar</Btn>
                          <span className="flex-1" />
                          <button onClick={async () => { await dispatch({ type: "duplicarProducto", id: p.id }); toast(`Copia de ${p.nombre} creada`); }} className="press grid h-8 w-8 place-items-center rounded-lg text-mute hover:bg-raised hover:text-ink" aria-label="Duplicar" title="Duplicar"><Copy size={14} /></button>
                          <button onClick={async () => { await dispatch({ type: "archivarProducto", id: p.id, archivar: true, usuario: sesion?.nombre }); toast(`${p.nombre} archivado`); }} className="press grid h-8 w-8 place-items-center rounded-lg text-mute hover:bg-raised hover:text-down" aria-label="Archivar" title="Archivar"><Archive size={14} /></button>
                        </>
                      ) : (
                        <Btn size="sm" variant="primary" onClick={() => dispatch({ type: "archivarProducto", id: p.id, archivar: false, usuario: sesion?.nombre })}><ArchiveRestore size={13} />Restaurar</Btn>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------- Modal de categoría ---------- */}
      <Modal open={!!catEdit} onClose={() => setCatEdit(null)} title={catEdit?.id ? "Editar categoría" : "Nueva categoría"}
        footer={<div className="flex justify-between gap-2">
          {catEdit?.id ? <Btn variant="ghost" onClick={async () => { const e = await dispatch({ type: "borrarCategoria", id: catEdit.id! }); if (e) return toast(e, "warn"); setCat("todas"); setCatEdit(null); toast("Categoría borrada"); }}><Trash2 size={14} />Borrar</Btn> : <span />}
          <span className="flex gap-2"><Btn onClick={() => setCatEdit(null)}>Cancelar</Btn><Btn variant="primary" onClick={guardarCategoria}>Guardar</Btn></span>
        </div>}>
        {catEdit && (
          <div className="space-y-4">
            <Field label="Nombre"><input id="cat-nombre" autoFocus value={catEdit.nombre} onChange={(e) => setCatEdit({ ...catEdit, nombre: e.target.value })} onKeyDown={(e) => e.key === "Enter" && guardarCategoria()} className={inputCls} placeholder="Ej: Vinos, Minutas, Sin TACC" /></Field>
            <Field label="Se prepara en" grupo>
              <Segmented value={catEdit.estacion} onChange={(v) => setCatEdit({ ...catEdit, estacion: v })} options={[{ value: "cocina", label: "Cocina" }, { value: "barra", label: "Barra" }]} />
            </Field>
            <p className="text-xs text-mute">Los productos de esta categoría se envían a la pantalla de {catEdit.estacion === "barra" ? "barra" : "cocina"}.</p>
          </div>
        )}
      </Modal>

      {/* ---------- Modal de producto ---------- */}
      <EditorProducto edit={edit} setEdit={setEdit} onGuardar={guardar} />
    </div>
  );
}

function CatItem({ activo, onClick, nombre, n, icono }: { activo: boolean; onClick: () => void; nombre: string; n: number; icono?: React.ReactNode }) {
  return (
    <button onClick={onClick} className={cx("press flex w-full items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm", activo ? "bg-up/10 font-semibold text-up" : "text-ink/80 hover:bg-raised")}>
      {icono && <span className={activo ? "text-up" : "text-mute"}>{icono}</span>}
      <span className="flex-1 truncate">{nombre}</span>
      <span className="font-mono text-xs text-mute">{n}</span>
    </button>
  );
}

function EditorProducto({ edit, setEdit, onGuardar }: { edit: Borrador | null; setEdit: (b: Borrador | null) => void; onGuardar: () => void }) {
  const s = useNexo();
  const [tab, setTab] = useState<"general" | "precio" | "receta" | "opciones">("general");
  const archivo = useRef<HTMLInputElement>(null);
  const [biblioteca, setBiblioteca] = useState(false);
  if (!edit) return null;
  const costo = Math.round(edit.receta.reduce((a, r) => a + r.cantidad * (s.insumos.find((i) => i.id === r.insumo_id)?.costo_unitario ?? 0), 0));
  const piso = pisoEfectivo({ precio_minimo: edit.precio_minimo }, costo, s.bar.reglas_precios);
  const grupos = [...new Set(edit.mods.map((m) => m.grupo))];

  async function subir(f?: File) {
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast("Elegí un archivo de imagen", "warn");
    try { setEdit({ ...edit!, icono: await comprimirFoto(f) }); toast("Foto cargada"); } catch { toast("No pudimos leer esa imagen", "down"); }
  }

  return (
    <Modal open onClose={() => setEdit(null)} wide title={edit.id ? edit.nombre || "Producto" : "Nuevo producto"}
      footer={<div className="flex items-center justify-between gap-2">
        <Segmented value={tab} onChange={setTab} options={[{ value: "general", label: "General" }, { value: "precio", label: "Precio" }, { value: "receta", label: `Receta${edit.receta.length ? ` · ${edit.receta.length}` : ""}` }, { value: "opciones", label: `Opciones${edit.mods.length ? ` · ${edit.mods.length}` : ""}` }]} className="hidden sm:inline-flex" />
        <span className="flex gap-2"><Btn onClick={() => setEdit(null)}>Cancelar</Btn><Btn variant="primary" onClick={onGuardar}><Check size={16} />Guardar</Btn></span>
      </div>}>
      <Segmented value={tab} onChange={setTab} options={[{ value: "general", label: "General" }, { value: "precio", label: "Precio" }, { value: "receta", label: "Receta" }, { value: "opciones", label: "Opciones" }]} className="mb-4 sm:hidden" />

      {tab === "general" && (
        <div className="grid gap-6 md:grid-cols-[240px_1fr]">
          <div>
            <div
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); subir(e.dataTransfer.files[0]); }}
              className="relative overflow-hidden rounded-2xl border border-line">
              <ProductIcon icono={edit.icono} size="full" alt={edit.nombre} className="!rounded-none" />
              <button onClick={() => archivo.current?.click()} className="press absolute inset-x-2 bottom-2 flex items-center justify-center gap-2 rounded-xl bg-black/75 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-black/85">
                <Camera size={16} />{esFotoPropia(edit.icono) ? "Cambiar foto" : "Subir foto propia"}
              </button>
            </div>
            <input ref={archivo} type="file" accept="image/*" className="hidden" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ""; }} />
            <p className="mt-2 text-xs text-mute">Arrastrá una imagen o tocá para subirla. Se recorta en cuadrado.</p>
            <button onClick={() => setBiblioteca((v) => !v)} className="mt-2 flex items-center gap-1.5 text-xs text-up"><ImagePlus size={13} />{biblioteca ? "Ocultar fotos de la biblioteca" : "Elegir de la biblioteca"}</button>
            {biblioteca && (
              <div className="mt-2 grid grid-cols-5 gap-1.5">
                {ICONOS_DISPONIBLES.map((ic) => (
                  <button key={ic} type="button" onClick={() => setEdit({ ...edit, icono: ic })} className={cx("press overflow-hidden rounded-lg", edit.icono === ic ? "ring-2 ring-up" : "ring-1 ring-line")} aria-label={ic}><ProductIcon icono={ic} size="full" /></button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-4">
            <Field label="Nombre"><input id="prod-nombre" autoFocus={!edit.id} value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} className={inputCls} placeholder="Ej: Fernet con coca" /></Field>
            <Field label="Descripción en la carta"><textarea id="prod-desc" value={edit.descripcion} onChange={(e) => setEdit({ ...edit, descripcion: e.target.value })} className={cx(inputCls, "h-20 py-2")} placeholder="Ingredientes o cómo se sirve" maxLength={140} /></Field>
            <Field label="Categoría">
              <select id="prod-cat" value={edit.categoria_id} onChange={(e) => setEdit({ ...edit, categoria_id: e.target.value })} className={inputCls}>
                {[...s.categorias].sort((a, b) => a.orden - b.orden).map((c) => <option key={c.id} value={c.id}>{c.nombre} · se prepara en {c.estacion}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Precio de venta"><input id="prod-base-g" type="number" min={0} step={50} value={edit.precio_base || ""} onChange={(e) => { const b = Number(e.target.value); setEdit({ ...edit, precio_base: b, precio_minimo: Math.round((b * 0.75) / 50) * 50, precio_maximo: Math.round((b * (1 + s.bar.reglas_precios.tope_pct / 100)) / 50) * 50 }); }} className={cx(inputCls, "font-mono")} placeholder="$" /></Field>
              <Field label="Tiempo de preparación (min)"><input id="prod-tiempo" type="number" min={1} value={edit.tiempo_objetivo_min} onChange={(e) => setEdit({ ...edit, tiempo_objetivo_min: Number(e.target.value) })} className={inputCls} /></Field>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={edit.destacado} onChange={(e) => setEdit({ ...edit, destacado: e.target.checked })} /><Star size={15} className="text-warn" />Mostrar en grande en la pantalla del salón</label>
          </div>
        </div>
      )}

      {tab === "precio" && (
        <div className="space-y-5">
          <label className="flex items-start gap-3 rounded-2xl border border-line p-4">
            <input type="checkbox" className="mt-1" checked={edit.es_cotizable_bolsa} onChange={(e) => setEdit({ ...edit, es_cotizable_bolsa: e.target.checked })} />
            <span><span className="flex items-center gap-2 font-semibold"><TrendingUp size={16} className="text-up" />Cotiza en la bolsa</span><span className="mt-0.5 block text-sm text-mute">El precio sube cuando se vende mucho y baja cuando no se mueve, siempre entre el piso y el tope.</span></span>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Precio base"><input id="prod-base" type="number" min={0} step={50} value={edit.precio_base || ""} onChange={(e) => setEdit({ ...edit, precio_base: Number(e.target.value) })} className={cx(inputCls, "font-mono")} /></Field>
            <Field label="Mínimo (piso)"><input id="prod-min" type="number" min={0} step={50} value={edit.precio_minimo || ""} disabled={!edit.es_cotizable_bolsa} onChange={(e) => setEdit({ ...edit, precio_minimo: Number(e.target.value) })} className={cx(inputCls, "font-mono")} /></Field>
            <Field label="Máximo (tope)"><input id="prod-max" type="number" min={0} step={50} value={edit.precio_maximo || ""} disabled={!edit.es_cotizable_bolsa} onChange={(e) => setEdit({ ...edit, precio_maximo: Number(e.target.value) })} className={cx(inputCls, "font-mono")} /></Field>
          </div>
          {edit.es_cotizable_bolsa && (
            <>
              <Field label="Ventas esperadas por ventana de 15 min"><input id="prod-obj" type="number" min={0} value={edit.objetivo_ventana} onChange={(e) => setEdit({ ...edit, objetivo_ventana: Number(e.target.value) })} className={cx(inputCls, "w-40")} /></Field>
              <dl className="grid grid-cols-3 gap-3 rounded-2xl border border-line bg-bg/60 p-4 text-sm">
                <div><dt className="text-xs text-mute">Costo de receta</dt><dd className="font-mono text-lg">{costo ? money(costo) : "—"}</dd></div>
                <div><dt className="text-xs text-mute">Piso real</dt><dd className="font-mono text-lg text-warn">{money(piso)}</dd></div>
                <div><dt className="text-xs text-mute">Margen en el piso</dt><dd className="font-mono text-lg">{costo && piso ? `${Math.round((1 - costo / piso) * 100)}%` : "—"}</dd></div>
              </dl>
              {piso > edit.precio_minimo && <p className="text-xs text-warn">El costo de la receta sube el piso: el precio nunca va a bajar de {money(piso)}.</p>}
            </>
          )}
        </div>
      )}

      {tab === "receta" && (
        <div>
          <p className="mb-3 text-sm text-mute">Cantidad de cada insumo por porción. Con la receta, el stock se descuenta solo y el producto se agota cuando falta un ingrediente.</p>
          {!s.insumos.length && <p className="mb-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">Todavía no cargaste insumos. Agregalos en Stock y recetas.</p>}
          <ul className="space-y-2">
            {edit.receta.map((r, i) => {
              const ins = s.insumos.find((x) => x.id === r.insumo_id);
              return (
                <li key={i} className="flex items-center gap-2">
                  <select value={r.insumo_id} onChange={(e) => setEdit({ ...edit, receta: edit.receta.map((x, j) => (j === i ? { ...x, insumo_id: e.target.value } : x)) })} className={cx(inputCls, "h-10 flex-1")}>{s.insumos.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
                  <input type="number" min={0} step="any" value={r.cantidad || ""} onChange={(e) => setEdit({ ...edit, receta: edit.receta.map((x, j) => (j === i ? { ...x, cantidad: Number(e.target.value) } : x)) })} className={cx(inputCls, "h-10 w-24 text-right font-mono")} aria-label="Cantidad" />
                  <span className="w-8 text-xs text-mute">{ins?.unidad}</span>
                  <span className="w-20 text-right font-mono text-xs">{money(r.cantidad * (ins?.costo_unitario ?? 0))}</span>
                  <button onClick={() => setEdit({ ...edit, receta: edit.receta.filter((_, j) => j !== i) })} className="press grid h-9 w-9 place-items-center rounded-lg text-mute hover:bg-raised hover:text-down" aria-label="Quitar"><Trash2 size={14} /></button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center justify-between">
            <Btn size="sm" disabled={!s.insumos.length} onClick={() => setEdit({ ...edit, receta: [...edit.receta, { insumo_id: s.insumos[0].id, cantidad: 0 }] })}><Plus size={13} />Agregar insumo</Btn>
            <span className="text-sm">Costo por porción <b className="font-mono">{money(costo)}</b>{edit.precio_base > 0 && costo > 0 && <> · margen <b className={cx("font-mono", (1 - costo / edit.precio_base) * 100 >= 65 ? "text-up" : "text-warn")}>{Math.round((1 - costo / edit.precio_base) * 100)}%</b></>}</span>
          </div>
        </div>
      )}

      {tab === "opciones" && (
        <div>
          <p className="mb-3 text-sm text-mute">Opciones que el mozo y el cliente eligen al pedir: punto de cocción, extras con costo, sin hielo… Las opciones de un mismo grupo marcadas como "única" se excluyen entre sí.</p>
          {grupos.map((g) => (
            <div key={g} className="mb-3 rounded-2xl border border-line p-3">
              <div className="mb-2 flex items-center gap-2">
                <input value={g} onChange={(e) => setEdit({ ...edit, mods: edit.mods.map((m) => (m.grupo === g ? { ...m, grupo: e.target.value } : m)) })} className={cx(inputCls, "h-9 max-w-xs font-semibold")} aria-label="Nombre del grupo" />
                <label className="flex items-center gap-1.5 text-xs text-mute"><input type="checkbox" checked={edit.mods.filter((m) => m.grupo === g).every((m) => m.exclusivo)} onChange={(e) => setEdit({ ...edit, mods: edit.mods.map((m) => (m.grupo === g ? { ...m, exclusivo: e.target.checked } : m)) })} />Elegir una sola</label>
                <span className="flex-1" />
                <button onClick={() => setEdit({ ...edit, mods: edit.mods.filter((m) => m.grupo !== g) })} className="press grid h-8 w-8 place-items-center rounded-lg text-mute hover:bg-raised hover:text-down" aria-label="Borrar grupo"><Trash2 size={14} /></button>
              </div>
              <ul className="space-y-1.5">
                {edit.mods.map((m, i) => m.grupo !== g ? null : (
                  <li key={i} className="flex items-center gap-2">
                    <input value={m.nombre} onChange={(e) => setEdit({ ...edit, mods: edit.mods.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)) })} className={cx(inputCls, "h-9 flex-1")} placeholder="Ej: Extra cheddar" aria-label="Opción" />
                    <span className="text-xs text-mute">+$</span>
                    <input type="number" min={0} step={50} value={m.precio_extra || ""} onChange={(e) => setEdit({ ...edit, mods: edit.mods.map((x, j) => (j === i ? { ...x, precio_extra: Number(e.target.value) } : x)) })} className={cx(inputCls, "h-9 w-24 text-right font-mono")} placeholder="0" aria-label="Precio extra" />
                    <button onClick={() => setEdit({ ...edit, mods: edit.mods.filter((_, j) => j !== i) })} className="press grid h-8 w-8 place-items-center rounded-lg text-mute hover:bg-raised hover:text-down" aria-label="Quitar opción"><X size={14} /></button>
                  </li>
                ))}
              </ul>
              <button onClick={() => setEdit({ ...edit, mods: [...edit.mods, { grupo: g, nombre: "", precio_extra: 0, exclusivo: edit.mods.find((m) => m.grupo === g)?.exclusivo ?? false }] })} className="mt-2 flex items-center gap-1 text-xs text-up"><Plus size={12} />Agregar opción</button>
            </div>
          ))}
          <Btn size="sm" onClick={() => setEdit({ ...edit, mods: [...edit.mods, { grupo: grupos.includes("Extras") ? `Grupo ${grupos.length + 1}` : "Extras", nombre: "", precio_extra: 0, exclusivo: false }] })}><Plus size={13} />Nuevo grupo de opciones</Btn>
        </div>
      )}
    </Modal>
  );
}
