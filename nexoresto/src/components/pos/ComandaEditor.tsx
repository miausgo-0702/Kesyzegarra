"use client";
// Comanda táctil del mozo: buscador ultra rápido, precio congelado al agregar,
// modificadores, notas, comensal (para dividir) y envío directo a cocina/barra.
import { useMemo, useRef, useState } from "react";
import { Minus, Plus, Search, Send, Trash2, Users, Zap, Receipt, ChefHat, Martini, Sparkles } from "lucide-react";
import { Badge, Btn, Empty, Segmented, inputCls, toast } from "@/components/ui/kit";
import { ProductIcon } from "@/components/icons/ProductIcon";
import { useDispatch, useNexo, useNow, useSesion } from "@/lib/store/NexoProvider";
import { nuevoId } from "@/lib/store/backend";
import { cx, money } from "@/lib/format";
import { enCrash, extrasItem, importeItem, itemsDe, pedidosAbiertosMesa } from "@/lib/store/selectors";
import { getSmartUpsell } from "@/lib/ai/learningEngine";
import type { Mesa, ModificadorElegido, Producto } from "@/lib/types";

export interface LineaCarrito { key: string; producto: Producto; cantidad: number; precio_visto: number; modificadores: ModificadorElegido[]; notas: string; persona: number | null }

const ESTADO_ITEM: Record<string, { t: string; tono: "info" | "warn" | "up" | "mute" | "down" }> = {
  pendiente: { t: "Pendiente", tono: "info" }, marchando: { t: "Marchando", tono: "warn" }, listo: { t: "Listo", tono: "up" }, entregado: { t: "Entregado", tono: "mute" }, anulado: { t: "Anulado", tono: "down" },
};

export function ComandaEditor({ mesa, onEnviado }: { mesa: Mesa; onEnviado?: () => void }) {
  const s = useNexo();
  const now = useNow(5000);
  const dispatch = useDispatch();
  const sesion = useSesion();
  const [cat, setCat] = useState<string>(s.categorias[0]?.id ?? "");
  const [q, setQ] = useState("");
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [personas, setPersonas] = useState(2);
  const [tab, setTab] = useState<"comanda" | "cuenta">("comanda");
  const idem = useRef(nuevoId());
  const busq = useRef<HTMLInputElement>(null);

  const productos = useMemo(() => {
    const t = q.trim().toLowerCase();
    return s.productos.filter((p) => p.activo && (t ? p.nombre.toLowerCase().includes(t) || p.descripcion.toLowerCase().includes(t) : p.categoria_id === cat));
  }, [s.productos, q, cat]);

  const pedidos = pedidosAbiertosMesa(s, mesa.id);
  const itemsMesa = pedidos.flatMap((p) => itemsDe(s, p.id));
  const upsell = useMemo(() => getSmartUpsell(s, [...carrito.map((l) => l.producto.id), ...itemsMesa.map((i) => i.producto_id)], 2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [carrito.length, itemsMesa.length]);

  function agregar(p: Producto) {
    // Congelamos la cotización vigente al momento de tomar el pedido
    const linea: LineaCarrito = { key: nuevoId(), producto: p, cantidad: 1, precio_visto: p.precio_actual, modificadores: [], notas: "", persona: null };
    setCarrito((c) => [...c, linea]);
    if (s.modificadores.some((m) => m.producto_id === p.id || m.categoria_id === p.categoria_id)) setEditando(linea.key);
    setQ("");
  }
  const upd = (key: string, f: (l: LineaCarrito) => LineaCarrito) => setCarrito((c) => c.map((l) => (l.key === key ? f(l) : l)));

  async function enviar() {
    if (!carrito.length) return;
    const err = await dispatch({
      type: "crearPedido", tipo: "salon", mesa_id: mesa.id, idempotency_key: idem.current, mozo_id: sesion?.usuario_id ?? null,
      items: carrito.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad, modificadores: l.modificadores, notas: l.notas || null, persona: l.persona, precio_visto: l.precio_visto })),
    });
    if (err) return toast(err, "down");
    const cocina = carrito.filter((l) => l.producto.estacion === "cocina").reduce((a, l) => a + l.cantidad, 0);
    const barra = carrito.filter((l) => l.producto.estacion === "barra").reduce((a, l) => a + l.cantidad, 0);
    toast(`Enviado · ${cocina} a cocina · ${barra} a barra`);
    setCarrito([]);
    idem.current = nuevoId(); // nueva clave para el próximo envío
    onEnviado?.();
  }

  const totalCarrito = carrito.reduce((a, l) => a + l.cantidad * (l.precio_visto + extrasItem(l)), 0);
  const totalMesa = itemsMesa.reduce((a, i) => a + importeItem(i), 0);
  const editLinea = carrito.find((l) => l.key === editando);

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[1.35fr_1fr]">
      {/* --------- catálogo --------- */}
      <div className="flex min-h-0 flex-col">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <input ref={busq} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto… (ej: gin, burger)" className={cx(inputCls, "h-12 pl-10 text-base")} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && productos[0]) agregar(productos[0]); }} />
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scroll-thin">
          {s.categorias.map((c) => (
            <button key={c.id} onClick={() => { setCat(c.id); setQ(""); }}
              className={cx("whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium", !q && cat === c.id ? "border-up/50 bg-up/10 text-up" : "border-line text-mute hover:text-ink")}>
              {c.nombre}
            </button>
          ))}
        </div>
        <div className="mt-3 grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-2 overflow-y-auto pr-1 scroll-thin sm:grid-cols-3">
          {productos.map((p) => {
            const crash = enCrash(s, p.id, now);
            const sube = (p.precio_anterior ?? p.precio_actual) <= p.precio_actual;
            return (
              <button key={p.id} onClick={() => agregar(p)} className={cx("flex flex-col items-start gap-2 rounded-2xl border bg-card p-3 text-left transition active:scale-[0.97] hover:border-mute", crash ? "border-crash/60" : "border-line")}>
                <div className="flex w-full items-start justify-between">
                  <ProductIcon icono={p.icono} size={52} />
                  {crash && <Badge tono="crash"><Zap size={10} />Crash</Badge>}
                </div>
                <div className="text-sm font-semibold leading-tight">{p.nombre}</div>
                <div className={cx("font-mono text-sm", sube ? "text-up" : "text-down")}>{money(p.precio_actual)} {p.es_cotizable_bolsa && (sube ? "▲" : "▼")}</div>
              </button>
            );
          })}
          {productos.length === 0 && <div className="col-span-full"><Empty title="Sin resultados" hint="Probá con otra palabra." /></div>}
        </div>
      </div>

      {/* --------- comanda / cuenta --------- */}
      <div className="flex min-h-0 flex-col rounded-2xl border border-line bg-bg/60 p-3">
        <Segmented value={tab} onChange={setTab} options={[{ value: "comanda", label: "Comanda" }, { value: "cuenta", label: `Cuenta · ${money(totalMesa)}` }]} className="self-start" />

        {tab === "comanda" ? (
          <>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto scroll-thin">
              {carrito.length === 0 && itemsMesa.length === 0 && <Empty icon={<Receipt size={30} />} title="Comanda vacía" hint="Tocá un producto para agregarlo. Enter agrega el primer resultado de la búsqueda." />}
              <ul className="flex flex-col gap-2">
                {carrito.map((l) => (
                  <li key={l.key} className={cx("rounded-xl border bg-card p-2.5", editando === l.key ? "border-up/50" : "border-line")}>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditando(editando === l.key ? null : l.key)} className="min-w-0 flex-1 text-left">
                        <div className="truncate text-sm font-semibold">{l.producto.nombre}</div>
                        <div className="truncate text-xs text-warn">{[...l.modificadores.map((m) => m.nombre), l.notas, l.persona ? `Comensal ${l.persona}` : null].filter(Boolean).join(" · ") || <span className="text-mute">+ modificadores / notas</span>}</div>
                      </button>
                      <span className="flex items-center gap-1">
                        <button className="grid h-8 w-8 place-items-center rounded-lg bg-raised" onClick={() => l.cantidad > 1 ? upd(l.key, (x) => ({ ...x, cantidad: x.cantidad - 1 })) : setCarrito((c) => c.filter((x) => x.key !== l.key))} aria-label="Restar">{l.cantidad > 1 ? <Minus size={14} /> : <Trash2 size={14} className="text-down" />}</button>
                        <span className="w-6 text-center font-mono">{l.cantidad}</span>
                        <button className="grid h-8 w-8 place-items-center rounded-lg bg-raised" onClick={() => upd(l.key, (x) => ({ ...x, cantidad: x.cantidad + 1 }))} aria-label="Sumar"><Plus size={14} /></button>
                      </span>
                      <span className="w-20 text-right font-mono text-sm">{money(l.cantidad * (l.precio_visto + extrasItem(l)))}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-dim">
                      <span>{l.producto.estacion === "cocina" ? <><ChefHat size={10} className="inline" /> cocina</> : <><Martini size={10} className="inline" /> barra</>}</span>
                      <span>cotización congelada {money(l.precio_visto)}</span>
                    </div>
                  </li>
                ))}
              </ul>

              {editLinea && <EditorModificadores linea={editLinea} onChange={(f) => upd(editLinea.key, f)} onClose={() => setEditando(null)} />}

              {upsell.length > 0 && carrito.length > 0 && (
                <div className="mt-3 rounded-xl border border-violet/30 bg-violet/5 p-2.5">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-violet"><Sparkles size={12} />Sugerido por IA</div>
                  <div className="flex gap-2">
                    {upsell.map((u) => (
                      <button key={u.producto.id} onClick={() => agregar(u.producto)} className="flex flex-1 items-center gap-2 rounded-lg border border-line bg-card p-2 text-left hover:border-violet/50">
                        <ProductIcon icono={u.producto.icono} size={34} />
                        <span className="min-w-0"><span className="block truncate text-xs font-semibold">{u.producto.nombre}</span><span className="block truncate text-[10px] text-mute">{u.razon}</span></span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {itemsMesa.length > 0 && (
                <div className="mt-4">
                  <div className="eyebrow mb-2">Ya enviado</div>
                  <ul className="flex flex-col gap-1">
                    {itemsMesa.map((i) => (
                      <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm odd:bg-card/60">
                        <span className={cx("min-w-0 truncate", i.estado_cocina === "anulado" && "line-through text-mute")}><span className="font-mono">{i.cantidad}×</span> {i.nombre}</span>
                        <Badge tono={ESTADO_ITEM[i.estado_cocina].tono}>{ESTADO_ITEM[i.estado_cocina].t}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-2 flex justify-between text-sm"><span className="text-mute">A enviar</span><span className="font-mono font-semibold">{money(totalCarrito)}</span></div>
              <Btn variant="primary" size="xl" className="w-full" disabled={!carrito.length} onClick={enviar}><Send size={18} />Enviar a cocina y barra</Btn>
            </div>
          </>
        ) : (
          <CuentaDividida mesa={mesa} personas={personas} setPersonas={setPersonas} />
        )}
      </div>
    </div>
  );
}

function EditorModificadores({ linea, onChange, onClose }: { linea: LineaCarrito; onChange: (f: (l: LineaCarrito) => LineaCarrito) => void; onClose: () => void }) {
  const mods = useNexo((s) => s.modificadores.filter((m) => m.producto_id === linea.producto.id || m.categoria_id === linea.producto.categoria_id));
  const grupos = [...new Set(mods.map((m) => m.grupo))];
  const toggle = (m: (typeof mods)[number]) => onChange((l) => {
    const tiene = l.modificadores.some((x) => x.nombre === m.nombre);
    let next = l.modificadores.filter((x) => !(m.exclusivo && x.grupo === m.grupo));
    next = tiene ? l.modificadores.filter((x) => x.nombre !== m.nombre) : [...next, { grupo: m.grupo, nombre: m.nombre, precio_extra: m.precio_extra }];
    return { ...l, modificadores: next };
  });
  return (
    <div className="mt-2 animate-slideIn rounded-xl border border-up/30 bg-panel p-3">
      <div className="mb-2 flex items-center justify-between"><span className="eyebrow">Modificadores · {linea.producto.nombre}</span><button onClick={onClose} className="text-xs text-up">Listo</button></div>
      {grupos.map((g) => (
        <div key={g} className="mb-2">
          <div className="mb-1 text-[11px] text-mute">{g}</div>
          <div className="flex flex-wrap gap-1.5">
            {mods.filter((m) => m.grupo === g).map((m) => {
              const on = linea.modificadores.some((x) => x.nombre === m.nombre);
              return (
                <button key={m.id} onClick={() => toggle(m)} className={cx("rounded-full border px-3 py-1.5 text-xs font-medium", on ? (m.precio_extra ? "border-info/60 bg-info/15 text-info" : "border-up/60 bg-up/15 text-up") : "border-line text-mute")}>
                  {m.nombre}{m.precio_extra ? ` +${money(m.precio_extra)}` : ""}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <input value={linea.notas} onChange={(e) => onChange((l) => ({ ...l, notas: e.target.value }))} placeholder="Nota para cocina (ej: alérgico al maní)" className={cx(inputCls, "mt-1 h-10")} />
      <div className="mt-2 flex items-center gap-2 text-xs text-mute">
        <Users size={14} />Comensal:
        {[null, 1, 2, 3, 4, 5, 6].map((n) => (
          <button key={String(n)} onClick={() => onChange((l) => ({ ...l, persona: n }))} className={cx("h-7 min-w-7 rounded-md border px-1.5 font-mono", linea.persona === n ? "border-up/60 text-up" : "border-line")}>{n ?? "—"}</button>
        ))}
      </div>
    </div>
  );
}

function CuentaDividida({ mesa, personas, setPersonas }: { mesa: Mesa; personas: number; setPersonas: (n: number) => void }) {
  const s = useNexo();
  const dispatch = useDispatch();
  const [modo, setModo] = useState<"iguales" | "comensal">("iguales");
  const pedidos = pedidosAbiertosMesa(s, mesa.id);
  const items = pedidos.flatMap((p) => itemsDe(s, p.id)).filter((i) => i.estado_cocina !== "anulado");
  const total = items.reduce((a, i) => a + importeItem(i), 0);
  const propina = Math.round((total * s.bar.propina_sugerida_pct) / 100);
  const porComensal = new Map<string, number>();
  for (const i of items) porComensal.set(i.persona ? `Comensal ${i.persona}` : "Compartido", (porComensal.get(i.persona ? `Comensal ${i.persona}` : "Compartido") ?? 0) + importeItem(i));
  const compartido = porComensal.get("Compartido") ?? 0;
  const nCom = [...porComensal.keys()].filter((k) => k !== "Compartido").length || 1;

  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin">
        <ul className="flex flex-col gap-1 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-2"><span className="truncate"><span className="font-mono">{i.cantidad}×</span> {i.nombre}{i.persona ? <span className="text-mute"> · C{i.persona}</span> : ""}</span><span className="font-mono">{money(importeItem(i))}</span></li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><span className="text-mute">Subtotal</span><span className="font-mono">{money(total)}</span></div>
          <div className="flex justify-between"><span className="text-mute">Propina sugerida {s.bar.propina_sugerida_pct} %</span><span className="font-mono">{money(propina)}</span></div>
          <div className="flex justify-between text-lg font-bold"><span>Total</span><span className="font-mono text-up">{money(total + propina)}</span></div>
        </div>
        <div className="mt-4">
          <Segmented value={modo} onChange={setModo} options={[{ value: "iguales", label: "Partes iguales" }, { value: "comensal", label: "Por comensal" }]} />
          {modo === "iguales" ? (
            <div className="mt-3">
              <div className="flex gap-1.5">{[1, 2, 3, 4, 5, 6].map((n) => <button key={n} onClick={() => setPersonas(n)} className={cx("h-10 flex-1 rounded-lg border font-mono", personas === n ? "border-up/60 bg-up/10 text-up" : "border-line")}>{n}</button>)}</div>
              <div className="mt-2 flex justify-between text-sm"><span className="text-mute">{personas} partes iguales</span><span className="font-mono">{money((total + propina) / personas)} c/u</span></div>
            </div>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {[...porComensal.entries()].filter(([k]) => k !== "Compartido").map(([k, v]) => (
                <li key={k} className="flex justify-between"><span>{k}</span><span className="font-mono">{money(v + compartido / nCom)}</span></li>
              ))}
              {compartido > 0 && <li className="text-xs text-mute">Incluye {money(compartido)} compartido dividido entre {nCom}.</li>}
              {porComensal.size === 1 && compartido > 0 && <li className="text-xs text-mute">Asigná comensales al cargar los ítems para dividir por persona.</li>}
            </ul>
          )}
        </div>
      </div>
      <Btn variant="warn" size="lg" className="mt-3 w-full" disabled={!items.length || mesa.estado === "cuenta_pedida"} onClick={async () => { await dispatch({ type: "mesaEstado", mesa_id: mesa.id, estado: "cuenta_pedida" }); toast(`Mesa ${mesa.numero}: cuenta pedida · aviso a caja`, "warn"); }}>
        <Receipt size={18} />{mesa.estado === "cuenta_pedida" ? "Cuenta ya pedida" : "Pedir la cuenta a caja"}
      </Btn>
    </div>
  );
}
