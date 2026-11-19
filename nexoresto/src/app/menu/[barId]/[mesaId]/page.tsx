"use client";
// =============================================================================
//  FASE 5.1 · WebApp del cliente (QR de mesa o delivery) — mobile-first
//  Carta con precios tipo bolsa en vivo, carrito con precio congelado al
//  agregar, seguimiento del pedido, "Subí tu foto y ganá", votación y cartelera.
// =============================================================================
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CalendarDays, Check, ChevronRight, Heart, Image as ImageIcon, LocateFixed, Minus, Plus, Receipt, ShoppingBag, Sparkles, Trophy, UtensilsCrossed, X, Zap } from "lucide-react";
import { Badge, Btn, Logo, inputCls, toast } from "@/components/ui/kit";
import { FotoView, ProductIcon } from "@/components/icons/ProductIcon";
import { Sparkline } from "@/components/ui/Sparkline";
import { QR } from "@/components/ui/QR";
import { useBackend, useDispatch, useNexo, useNow, useSesionCliente } from "@/lib/store/NexoProvider";
import { nuevoId } from "@/lib/store/backend";
import { cronometro, cx, fechaCorta, hhmm, money } from "@/lib/format";
import { crashActivo } from "@/lib/exchangeEngine";
import { getSmartUpsell } from "@/lib/ai/learningEngine";
import { disponible, extrasItem } from "@/lib/store/selectors";
import type { ModificadorElegido, Producto } from "@/lib/types";

type Tab = "carta" | "fotos" | "eventos" | "pedido";
interface Linea { key: string; producto_id: string; cantidad: number; precio_visto: number; modificadores: ModificadorElegido[]; notas: string }

export default function MenuCliente({ params }: { params: Promise<{ barId: string; mesaId: string }> }) {
  const { mesaId } = use(params);
  const s = useNexo();
  const now = useNow(1000);
  const sesion = useSesionCliente();
  const esDelivery = mesaId === "delivery";
  const mesa = esDelivery ? null : s.mesas.find((m) => String(m.numero) === mesaId || m.id === mesaId || m.qr_token === mesaId) ?? null;
  const [tab, setTab] = useState<Tab>("carta");
  const [carrito, setCarrito] = useState<Linea[]>([]);
  const [detalle, setDetalle] = useState<Producto | null>(null);
  const [verCarrito, setVerCarrito] = useState(false);
  const enCrash = crashActivo(s.crash, now);
  const misPedidos = s.pedidos.filter((p) => p.sesion_cliente && p.sesion_cliente === sesion);
  const totalCarrito = carrito.reduce((a, l) => a + l.cantidad * (l.precio_visto + extrasItem(l)), 0);
  const cantCarrito = carrito.reduce((a, l) => a + l.cantidad, 0);

  if (!esDelivery && !mesa) return <div className="grid min-h-dvh place-items-center p-6 text-center text-mute">QR de mesa inválido. Pedile ayuda a tu mozo.</div>;

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-bg pb-28">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <Logo />
          <Badge tono="up">{esDelivery ? "Delivery" : `Mesa ${mesa!.numero}`}</Badge>
        </div>
        {enCrash && (
          <div className="mt-3 rounded-xl border border-crash/50 bg-crash/10 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-crash"><Zap size={13} />Market Crash</div>
            <div className="mt-0.5 flex items-center justify-between text-sm"><span>{s.crash!.mensaje} · precios mínimos</span><span className="font-mono font-bold text-crash">{cronometro(new Date(s.crash!.fin_at).getTime() - now)}</span></div>
          </div>
        )}
      </header>

      {tab === "carta" && <Carta onAbrir={setDetalle} enCrashIds={enCrash ? s.crash!.productos : []} />}
      {tab === "fotos" && <Fotos mesaId={mesa?.id ?? null} sesion={sesion} />}
      {tab === "eventos" && <Eventos />}
      {tab === "pedido" && <MiPedido sesion={sesion} mesaId={mesa?.id ?? null} />}

      {cantCarrito > 0 && tab === "carta" && (
        <button onClick={() => setVerCarrito(true)} className="fixed inset-x-4 bottom-20 z-30 mx-auto flex max-w-[calc(28rem-2rem)] animate-slideIn items-center justify-between rounded-2xl bg-up px-5 py-4 font-semibold text-black shadow-[0_10px_40px_-10px_rgba(30,224,143,.6)]">
          <span className="flex items-center gap-2"><ShoppingBag size={18} />{cantCarrito} en tu pedido</span>
          <span className="font-mono">{money(totalCarrito)} <ChevronRight size={16} className="inline" /></span>
        </button>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md justify-around border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {([["carta", "Carta", UtensilsCrossed], ["fotos", "Fotos", Camera], ["eventos", "Eventos", CalendarDays], ["pedido", "Mi pedido", Receipt]] as const).map(([k, t, I]) => (
          <button key={k} onClick={() => setTab(k)} className={cx("relative flex flex-1 flex-col items-center gap-1 py-3 text-[11px]", tab === k ? "text-up" : "text-mute")}>
            <I size={20} />{t}
            {k === "pedido" && misPedidos.some((p) => p.estado !== "cerrado") && <span className="absolute right-6 top-2 h-2 w-2 rounded-full bg-up" />}
          </button>
        ))}
      </nav>

      {detalle && <DetalleProducto p={detalle} onClose={() => setDetalle(null)} onAgregar={(l) => { setCarrito((c) => [...c, l]); setDetalle(null); toast(`${detalle.nombre} agregado`); }} />}
      {verCarrito && <Carrito lineas={carrito} setLineas={setCarrito} onClose={() => setVerCarrito(false)} mesaId={mesa?.id ?? null} sesion={sesion} esDelivery={esDelivery} onEnviado={() => { setCarrito([]); setVerCarrito(false); setTab("pedido"); }} onAbrir={(p) => { setVerCarrito(false); setDetalle(p); }} />}
    </div>
  );
}

function Carta({ onAbrir, enCrashIds }: { onAbrir: (p: Producto) => void; enCrashIds: string[] }) {
  const s = useNexo();
  const [cat, setCat] = useState(s.categorias[0]?.id);
  const refs = useRef<Record<string, HTMLElement | null>>({});
  const promos = s.promociones.filter((p) => p.activa);
  return (
    <div>
      <div className="sticky top-[57px] z-20 flex gap-2 overflow-x-auto bg-bg/90 px-4 py-3 backdrop-blur scroll-thin">
        {[...s.categorias].sort((a, b) => a.orden - b.orden).map((c) => (
          <button key={c.id} onClick={() => { setCat(c.id); refs.current[c.id]?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
            className={cx("whitespace-nowrap rounded-full border px-4 py-1.5 text-sm", cat === c.id ? "border-up/60 bg-up/10 text-up" : "border-line text-mute")}>{c.nombre}</button>
        ))}
      </div>
      {promos.length > 0 && (
        <div className="flex gap-3 overflow-x-auto px-4 pb-1 scroll-thin">
          {promos.map((p) => (
            <div key={p.id} className="min-w-[230px] rounded-2xl border border-warn/30 bg-gradient-to-br from-warn/15 to-transparent p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-warn">Promo</div>
              <div className="font-semibold">{p.titulo}</div>
              <div className="text-xs text-mute">{p.hora_desde}–{p.hora_hasta}</div>
            </div>
          ))}
        </div>
      )}
      {!s.productos.some((p) => p.activo) && <p className="px-6 py-16 text-center text-mute">La carta se está preparando. Consultá a tu mozo.</p>}
      {[...s.categorias].sort((a, b) => a.orden - b.orden).map((c) => {
        const ps = s.productos.filter((p) => p.categoria_id === c.id && p.activo);
        if (!ps.length) return null;
        return (
          <section key={c.id} ref={(el) => { refs.current[c.id] = el; }} className="scroll-mt-32 px-4 pt-5">
            <h2 className="mb-3 text-lg font-bold">{c.nombre}</h2>
            <ul className="flex flex-col gap-2.5">
              {ps.map((p) => {
                const cr = enCrashIds.includes(p.id);
                const up = p.variacion_porcentaje >= 0;
                const ok = disponible(s, p);
                return (
                  <li key={p.id}>
                    <button onClick={() => ok && onAbrir(p)} disabled={!ok} className={cx("press flex w-full items-center gap-3 rounded-2xl border bg-card p-2.5 text-left disabled:opacity-50", cr ? "border-crash/50" : "border-line")}>
                      <ProductIcon icono={p.icono} size={76} alt={p.nombre} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 font-semibold">{p.nombre}{cr && <Zap size={13} className="text-crash" />}</span>
                        <span className="line-clamp-1 text-xs text-mute">{p.descripcion}</span>
                        <span className="mt-1 flex items-center gap-2 font-mono text-sm">
                          <span className={cx("font-semibold", p.es_cotizable_bolsa ? (up ? "text-up" : "text-down") : "text-ink")}>{money(p.precio_actual)}</span>
                          {p.es_cotizable_bolsa && <span className={cx("text-xs", up ? "text-up" : "text-down")}>{up ? "▲" : "▼"} {Math.abs(p.variacion_porcentaje).toFixed(1).replace(".", ",")}%</span>}
                        </span>
                      </span>
                      {ok ? <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-up text-black"><Plus size={18} /></span> : <Badge tono="mute">Agotado</Badge>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      <p className="px-4 pt-6 text-center text-[11px] text-dim">Los precios cotizan en vivo según la demanda. Se te cobra el precio que viste al agregar el producto.</p>
    </div>
  );
}

function DetalleProducto({ p, onClose, onAgregar }: { p: Producto; onClose: () => void; onAgregar: (l: Linea) => void }) {
  const s = useNexo();
  const prod = s.productos.find((x) => x.id === p.id) ?? p;
  const [precioVisto] = useState(prod.precio_actual); // congelado al abrir
  const mods = s.modificadores.filter((m) => m.producto_id === p.id || m.categoria_id === p.categoria_id);
  const grupos = [...new Set(mods.map((m) => m.grupo))];
  const [sel, setSel] = useState<ModificadorElegido[]>([]);
  const [cant, setCant] = useState(1);
  const [notas, setNotas] = useState("");
  const total = cant * (precioVisto + sel.reduce((a, m) => a + m.precio_extra, 0));
  const up = prod.variacion_porcentaje >= 0;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto max-h-[92dvh] w-full max-w-md animate-slideIn overflow-y-auto rounded-t-3xl border-t border-line bg-panel" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          <ProductIcon icono={p.icono} size="full" alt={p.nombre} className="!aspect-[4/3] !rounded-none" />
          <button onClick={onClose} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-black/50" aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="p-5">
          <h2 className="text-xl font-bold">{p.nombre}</h2>
          <p className="text-sm text-mute">{p.descripcion}</p>
          <div className={cx("mt-2 font-mono text-lg font-semibold", up ? "text-up" : "text-down")}>{money(precioVisto)} {prod.es_cotizable_bolsa && <span className="text-sm">{up ? "▲ +" : "▼ −"}{Math.abs(prod.variacion_porcentaje).toFixed(1).replace(".", ",")}%</span>}</div>
          {prod.es_cotizable_bolsa && <div className="mt-2 h-20"><Sparkline data={(s.historial[p.id] ?? []).slice(-40)} up={up} height={80} /></div>}
          {grupos.map((g) => (
            <div key={g} className="mt-4 rounded-2xl border border-line p-3">
              <div className="eyebrow mb-2">{g}</div>
              <div className="flex flex-wrap gap-2">
                {mods.filter((m) => m.grupo === g).map((m) => {
                  const on = sel.some((x) => x.nombre === m.nombre);
                  return (
                    <button key={m.id} onClick={() => setSel((cur) => on ? cur.filter((x) => x.nombre !== m.nombre) : [...cur.filter((x) => !(m.exclusivo && x.grupo === m.grupo)), { grupo: m.grupo, nombre: m.nombre, precio_extra: m.precio_extra }])}
                      className={cx("rounded-full border px-3 py-1.5 text-sm", on ? "border-up/60 bg-up/10 text-up" : "border-line text-mute")}>
                      {m.nombre}{m.precio_extra ? ` +${money(m.precio_extra)}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="¿Alguna aclaración? (opcional)" className={cx(inputCls, "mt-4")} maxLength={120} />
          <div className="mt-5 flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-xl border border-line p-1">
              <button onClick={() => setCant((c) => Math.max(1, c - 1))} className="grid h-10 w-10 place-items-center" aria-label="Menos"><Minus size={16} /></button>
              <span className="w-6 text-center font-mono">{cant}</span>
              <button onClick={() => setCant((c) => c + 1)} className="grid h-10 w-10 place-items-center" aria-label="Más"><Plus size={16} /></button>
            </div>
            <Btn variant="primary" size="lg" className="flex-1" onClick={() => onAgregar({ key: nuevoId(), producto_id: p.id, cantidad: cant, precio_visto: precioVisto, modificadores: sel, notas })}>Agregar {money(total)}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function Carrito({ lineas, setLineas, onClose, mesaId, sesion, esDelivery, onEnviado, onAbrir }: { lineas: Linea[]; setLineas: (f: (l: Linea[]) => Linea[]) => void; onClose: () => void; mesaId: string | null; sesion: string; esDelivery: boolean; onEnviado: () => void; onAbrir: (p: Producto) => void }) {
  const s = useNexo();
  const dispatch = useDispatch();
  const backend = useBackend();
  const router = useRouter();
  const idem = useRef(nuevoId());
  const [confirmando, setConfirmando] = useState(false);
  const [cliente, setCliente] = useState({ nombre: "", telefono: "", direccion: "", lat: undefined as number | undefined, lng: undefined as number | undefined });
  const upsell = useMemo(() => getSmartUpsell(s, lineas.map((l) => l.producto_id), 2),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lineas.length]);
  const total = lineas.reduce((a, l) => a + l.cantidad * (l.precio_visto + extrasItem(l)), 0);
  const envio = 0; // el costo de envío por zona se configura por sucursal (ver docs)

  async function enviar() {
    if (esDelivery && (!cliente.nombre || !cliente.direccion || !cliente.telefono)) return toast("Completá nombre, teléfono y dirección", "warn");
    const err = await dispatch({
      type: "crearPedido", tipo: esDelivery ? "delivery" : "webapp_qr", mesa_id: mesaId, idempotency_key: idem.current, sesion_cliente: sesion,
      cliente: esDelivery ? cliente : undefined,
      items: lineas.map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad, modificadores: l.modificadores, notas: l.notas || null, precio_visto: l.precio_visto })),
    });
    if (err) return toast(err, "down");
    toast("Pedido enviado. Ya está en cocina y barra");
    const key = idem.current;
    idem.current = nuevoId();
    if (esDelivery) {
      // Buscamos el envío creado por esta clave idempotente y llevamos al cliente al seguimiento
      const st = backend.getState();
      const ped = st?.pedidos.find((p) => p.idempotency_key === key);
      const env = ped && st?.envios.find((e) => e.pedido_id === ped.id);
      if (env) router.push(`/seguimiento/${env.tracking_token}`);
    }
    onEnviado();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto max-h-[92dvh] w-full max-w-md animate-slideIn overflow-y-auto rounded-t-3xl border-t border-line bg-panel p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-bold">Tu pedido</h2><button onClick={onClose} aria-label="Cerrar"><X /></button></div>
        <ul className="space-y-2">
          {lineas.map((l) => {
            const p = s.productos.find((x) => x.id === l.producto_id)!;
            return (
              <li key={l.key} className="flex items-center gap-3 rounded-xl border border-line bg-card p-2.5">
                <ProductIcon icono={p.icono} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{p.nombre}</div>
                  {(l.modificadores.length > 0 || l.notas) && <div className="truncate text-xs text-mute">{[...l.modificadores.map((m) => m.nombre), l.notas].filter(Boolean).join(" · ")}</div>}
                  <div className="font-mono text-xs text-mute">{money(l.precio_visto)} c/u · precio congelado</div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setLineas((c) => l.cantidad > 1 ? c.map((x) => x.key === l.key ? { ...x, cantidad: x.cantidad - 1 } : x) : c.filter((x) => x.key !== l.key))} className="grid h-8 w-8 place-items-center rounded-lg bg-raised"><Minus size={14} /></button>
                  <span className="w-5 text-center font-mono text-sm">{l.cantidad}</span>
                  <button onClick={() => setLineas((c) => c.map((x) => x.key === l.key ? { ...x, cantidad: x.cantidad + 1 } : x))} className="grid h-8 w-8 place-items-center rounded-lg bg-raised"><Plus size={14} /></button>
                </div>
              </li>
            );
          })}
        </ul>
        {upsell.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-violet"><Sparkles size={13} />Combina perfecto con tu pedido</div>
            <div className="grid grid-cols-2 gap-2">
              {upsell.map((u) => (
                <button key={u.producto.id} onClick={() => onAbrir(u.producto)} className="flex items-center gap-2 rounded-xl border border-violet/30 bg-violet/5 p-2 text-left">
                  <ProductIcon icono={u.producto.icono} size={40} />
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold">{u.producto.nombre}</span><span className="font-mono text-xs text-mute">{money(u.producto.precio_actual)}</span></span>
                </button>
              ))}
            </div>
          </div>
        )}
        {esDelivery && (
          <div className="mt-4 space-y-2">
            <div className="eyebrow">Datos de entrega</div>
            <input value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} placeholder="Nombre" className={inputCls} autoComplete="name" />
            <input value={cliente.telefono} onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })} placeholder="Teléfono" className={inputCls} inputMode="tel" autoComplete="tel" />
            <div className="flex gap-2">
              <input value={cliente.direccion} onChange={(e) => setCliente({ ...cliente, direccion: e.target.value })} placeholder="Dirección" className={inputCls} autoComplete="street-address" />
              <Btn onClick={() => navigator.geolocation?.getCurrentPosition((p) => { setCliente((c) => ({ ...c, lat: p.coords.latitude, lng: p.coords.longitude, direccion: c.direccion || "Mi ubicación actual" })); toast("Ubicación agregada"); }, () => toast("No pudimos obtener tu ubicación", "warn"))} aria-label="Usar mi ubicación"><LocateFixed size={16} /></Btn>
            </div>
          </div>
        )}
        <div className="mt-5 space-y-1 border-t border-line pt-3 text-sm">
          {esDelivery && <div className="flex justify-between text-mute"><span>Envío propio · sin comisiones de apps</span><span className="font-mono">{envio ? money(envio) : "Sin cargo"}</span></div>}
          <div className="flex justify-between text-lg font-bold"><span>Total</span><span className="font-mono text-up">{money(total + envio)}</span></div>
        </div>
        {!confirmando
          ? <Btn variant="primary" size="xl" className="mt-4 w-full" onClick={() => setConfirmando(true)} disabled={!lineas.length}>Confirmar pedido</Btn>
          : (
            <div className="mt-4 rounded-2xl border border-up/40 bg-up/5 p-4">
              <p className="text-sm">¿Enviamos el pedido {esDelivery ? "a tu domicilio" : "a tu mesa"}? Se cobra al pedir la cuenta {esDelivery ? "o al recibir" : "en caja o por QR"}.</p>
              <div className="mt-3 grid grid-cols-2 gap-2"><Btn onClick={() => setConfirmando(false)}>Revisar</Btn><Btn variant="primary" onClick={enviar}><Check size={16} />Sí, enviar</Btn></div>
            </div>
          )}
      </div>
    </div>
  );
}

function MiPedido({ sesion, mesaId }: { sesion: string; mesaId: string | null }) {
  const s = useNexo();
  const dispatch = useDispatch();
  const mios = s.pedidos.filter((p) => p.sesion_cliente === sesion).slice(0, 5);
  const mesa = s.mesas.find((m) => m.id === mesaId);
  if (!mios.length) return <div className="grid place-items-center gap-2 px-6 py-20 text-center text-mute"><Receipt size={34} />Todavía no pediste nada. ¡Mirá la carta!</div>;
  const total = mios.filter((p) => p.estado !== "cerrado").reduce((a, p) => a + p.total - p.pagado, 0);
  return (
    <div className="space-y-4 p-4">
      {mios.map((p) => {
        const items = s.items.filter((i) => i.pedido_id === p.id);
        const pend = items.some((i) => i.estado_cocina === "pendiente");
        const prep = items.some((i) => i.estado_cocina === "marchando") || (!pend && items.some((i) => i.estado_cocina === "listo"));
        const listo = items.every((i) => ["listo", "entregado", "anulado"].includes(i.estado_cocina));
        const entregado = items.every((i) => ["entregado", "anulado"].includes(i.estado_cocina));
        const pasos = [["Pedido recibido", true, p.created_at], ["En preparación", prep || listo, items.find((i) => i.marchando_at)?.marchando_at], ["Listo para servir", listo, items.find((i) => i.listo_at)?.listo_at], [p.tipo === "delivery" ? "En camino / entregado" : "En tu mesa", entregado, items.find((i) => i.entregado_at)?.entregado_at]] as const;
        return (
          <div key={p.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex items-center justify-between"><span className="font-semibold">Tu pedido #{p.tipo === "delivery" ? "D-" : ""}{p.numero}</span><Badge tono={entregado ? "mute" : listo ? "up" : "warn"}>{entregado ? "Entregado" : listo ? "Listo" : "En preparación"}</Badge></div>
            <ol className="mt-3 space-y-2">
              {pasos.map(([t, ok, h]) => (
                <li key={t} className="flex items-center gap-3 text-sm"><span className={cx("h-3 w-3 rounded-full", ok ? "bg-up shadow-[0_0_10px_#1ee08f]" : "bg-raised")} /><span className={cx("flex-1", !ok && "text-dim")}>{t}</span><span className="font-mono text-xs text-mute">{h ? hhmm(h) : "—"}</span></li>
              ))}
            </ol>
            <div className="mt-3 space-y-1 border-t border-line pt-2 text-sm">
              {items.map((i) => <div key={i.id} className="flex justify-between"><span>{i.cantidad}× {i.nombre}</span><span className="font-mono">{money(i.cantidad * (i.precio_unitario + extrasItem(i)))}</span></div>)}
            </div>
          </div>
        );
      })}
      {mesa && total > 0 && (
        <Btn size="xl" className="w-full" variant={mesa.estado === "cuenta_pedida" ? "ghost" : "outline"} disabled={mesa.estado === "cuenta_pedida"}
          onClick={async () => { await dispatch({ type: "mesaEstado", mesa_id: mesa.id, estado: "cuenta_pedida" }); toast("Avisamos a tu mozo, ya te acercan la cuenta"); }}>
          <Receipt size={18} />{mesa.estado === "cuenta_pedida" ? "Cuenta pedida · enseguida viene tu mozo" : `Pedir la cuenta · ${money(total)}`}
        </Btn>
      )}
    </div>
  );
}

/** Comprime la foto en el navegador (máx. 720 px, JPEG) antes de subirla. */
async function comprimir(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const escala = Math.min(1, 720 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.72);
}

function Fotos({ mesaId, sesion }: { mesaId: string | null; sesion: string }) {
  const s = useNexo();
  const dispatch = useDispatch();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [desc, setDesc] = useState("");
  const aprobadas = s.fotos.filter((f) => f.estado === "aprobada").sort((a, b) => b.votos_count - a.votos_count);
  const mias = s.fotos.filter((f) => f.sesion_cliente === sesion);
  const miVoto = s.votos.find((v) => v.sesion_cliente === sesion);
  const ganadoraMia = mias.find((f) => f.es_ganadora && f.cupon_codigo);

  useEffect(() => { if (ganadoraMia) toast("¡Tu foto ganó! Mirá tu cupón"); }, [ganadoraMia?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5 p-4">
      {ganadoraMia && (
        <div className="rounded-3xl border border-up/50 bg-gradient-to-br from-up/20 to-transparent p-5 text-center">
          <Trophy className="mx-auto text-up" size={30} />
          <h2 className="mt-2 text-xl font-bold">¡Tu foto ganó la noche!</h2>
          <p className="text-sm text-mute">Mostrá este código en caja: 20 % de descuento en tu cuenta.</p>
          <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3"><QR value={ganadoraMia.cupon_codigo!} size={150} /></div>
          <div className="mt-3 font-mono text-2xl font-bold tracking-widest text-up">{ganadoraMia.cupon_codigo}</div>
        </div>
      )}

      <div className="rounded-3xl border border-line bg-card p-4">
        <h2 className="flex items-center gap-2 text-lg font-bold"><Camera size={20} className="text-up" />Subí tu foto y ganá</h2>
        <p className="mt-1 text-sm text-mute">Sacale una foto a tu trago o plato. Si la aprueban sale en las pantallas del bar y la más votada gana un cupón del 20 %.</p>
        <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPreview(await comprimir(f)); e.target.value = ""; }} />
        {preview ? (
          <div className="mt-3 space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Vista previa" className="aspect-square w-full rounded-2xl object-cover" />
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descripción (ej: Pizza Napo con extra albahaca)" className={inputCls} maxLength={140} />
            <div className="grid grid-cols-2 gap-2">
              <Btn onClick={() => setPreview(null)}>Descartar</Btn>
              <Btn variant="primary" onClick={async () => { const e = await dispatch({ type: "subirFoto", mesa_id: mesaId, url_foto: preview, descripcion: desc, sesion_cliente: sesion }); if (e) return toast(e, "down"); toast("Foto enviada a moderación"); setPreview(null); setDesc(""); }}>Enviar a moderación</Btn>
            </div>
          </div>
        ) : <Btn variant="primary" size="lg" className="mt-3 w-full" onClick={() => input.current?.click()}><Camera size={18} />Sacar / elegir foto</Btn>}
        {mias.length > 0 && <div className="mt-3 flex gap-2">{mias.map((f) => <div key={f.id} className="text-center"><FotoView url={f.url_foto} size={64} className="rounded-xl" /><Badge className="mt-1" tono={f.estado === "aprobada" ? "up" : f.estado === "rechazada" ? "down" : "warn"}>{f.estado}</Badge></div>)}</div>}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Votá la mejor foto</h2><Badge tono="down" dot>En vivo</Badge></div>
        <p className="mb-3 text-xs text-mute">{miVoto ? "Ya usaste tu voto de esta ronda." : "Tenés 1 voto por ronda."}</p>
        <div className="grid grid-cols-2 gap-3">
          {aprobadas.map((f) => {
            const votada = miVoto?.foto_id === f.id;
            return (
              <div key={f.id} className={cx("overflow-hidden rounded-2xl border bg-card", votada ? "border-up/60" : "border-line")}>
                <FotoView url={f.url_foto} size="full" className="rounded-none" />
                <div className="p-2.5">
                  <div className="flex items-center justify-between text-xs"><span>Mesa {f.mesa_numero ?? "—"}</span><span className="flex items-center gap-1 font-mono text-up"><Heart size={12} fill="currentColor" />{f.votos_count}</span></div>
                  <Btn size="sm" variant={votada ? "primary" : "ghost"} className="mt-2 w-full" disabled={!!miVoto || f.sesion_cliente === sesion}
                    onClick={async () => { const e = await dispatch({ type: "votar", foto_id: f.id, sesion_cliente: sesion }); if (e) toast(e, "warn"); else toast("¡Voto registrado!"); }}>
                    {votada ? "Tu voto" : f.sesion_cliente === sesion ? "Tu foto" : "Votar"}
                  </Btn>
                </div>
              </div>
            );
          })}
          {!aprobadas.length && <div className="col-span-2 grid place-items-center gap-2 py-10 text-sm text-mute"><ImageIcon />Todavía no hay fotos aprobadas</div>}
        </div>
      </div>
    </div>
  );
}

function Eventos() {
  const s = useNexo();
  const eventos = s.eventos.filter((e) => e.estado === "publicado" || e.estado === "programado");
  return (
    <div className="space-y-3 p-4">
      <h2 className="text-lg font-bold">Cartelera</h2>
      {eventos.map((e, i) => (
        <article key={e.id} className="overflow-hidden rounded-3xl border border-line bg-card">
          {e.flyer_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={e.flyer_url} alt={e.titulo} className="aspect-[16/9] w-full object-cover" />
            : <div className={cx("grid aspect-[16/7] place-items-center bg-gradient-to-br text-3xl font-black tracking-tight", ["from-up/30 to-info/10", "from-down/30 to-warn/10", "from-violet/30 to-info/10"][i % 3])}>{e.titulo.toUpperCase()}</div>}
          <div className="p-4">
            <div className="flex items-center justify-between"><h3 className="font-bold">{e.titulo}</h3><span className="font-mono text-xs text-up">{fechaCorta(e.fecha)} · {hhmm(e.fecha)}</span></div>
            <p className="text-sm text-mute">{e.subtitulo} · {e.descripcion}</p>
          </div>
        </article>
      ))}
      <h2 className="pt-3 text-lg font-bold">Promociones</h2>
      {s.promociones.filter((p) => p.activa).map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-2xl border border-warn/30 bg-warn/5 p-4">
          <div><div className="font-semibold">{p.titulo}</div><div className="text-xs text-mute">{p.dias.map((d) => ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d]).join(" · ")}</div></div>
          <span className="font-mono text-sm text-warn">{p.hora_desde}–{p.hora_hasta}</span>
        </div>
      ))}
    </div>
  );
}
