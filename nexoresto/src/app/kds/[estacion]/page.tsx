"use client";
// =============================================================================
//  FASE 3 · KDS de Cocina y BDS de Barra (una sola vista, dos estaciones)
//  · Tarjetas grandes y táctiles (funcionan con guantes) en modo oscuro
//  · Semáforo: 0–10 min verde · 10–18 amarillo · +18 rojo parpadeante + sonido
//  · Agrupador de producción (lotes) en la barra lateral
//  · Optimistic UI: tocar un ítem lo marca LISTO al instante
//  · Despachar: saca la comanda, avisa al mozo y registra la demora
//  · Insignia de Market Crash para priorizar
// =============================================================================
import { use, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChefHat, Flame, Martini, Timer, Volume2, VolumeX, Zap, Bike } from "lucide-react";
import { Shell } from "@/components/ui/Shell";
import { Badge, Btn, Empty, toast } from "@/components/ui/kit";
import { ProductIcon } from "@/components/icons/ProductIcon";
import { useDispatch, useNexo, useNow, useSesion } from "@/lib/store/NexoProvider";
import { cantidad, cronometro, cx, money } from "@/lib/format";
import { minutosDesde, nivelStock, semaforo, type Semaforo } from "@/lib/store/selectors";
import { crashActivo } from "@/lib/exchangeEngine";
import { estimarEstacion } from "@/lib/ai/learningEngine";
import { sonido } from "@/lib/sound";
import type { Estacion, Pedido, PedidoItem } from "@/lib/types";

interface Comanda { pedido: Pedido; items: PedidoItem[]; mesa: number | null; sector: string; inicio: string; crash: boolean }

const SEM: Record<Semaforo, { borde: string; texto: string; fondo: string; label: string }> = {
  verde: { borde: "border-up/70", texto: "text-up", fondo: "bg-up/[0.04]", label: "EN TIEMPO" },
  amarillo: { borde: "border-warn/80", texto: "text-warn", fondo: "bg-warn/[0.05]", label: "ATENCIÓN" },
  rojo: { borde: "border-down", texto: "text-down", fondo: "bg-down/[0.08]", label: "DEMORADA" },
};

export default function KDS({ params }: { params: Promise<{ estacion: string }> }) {
  const { estacion: raw } = use(params);
  const estacion: Estacion = raw === "barra" ? "barra" : "cocina";
  return (
    <Shell roles={estacion === "barra" ? ["bartender"] : ["cocina"]} sinSidebar full titulo={estacion === "cocina" ? "Cocina · Kitchen Display System" : "Barra · Bar Display System"}>
      <Tablero estacion={estacion} />
    </Shell>
  );
}

function Tablero({ estacion }: { estacion: Estacion }) {
  const s = useNexo();
  const now = useNow(1000);
  const dispatch = useDispatch();
  const sesion = useSesion();
  const [sonidoOn, setSonidoOn] = useState(true);
  // Optimistic UI: ítems marcados localmente antes de que confirme el servidor
  const [optimista, setOptimista] = useState<Record<string, "listo" | "pendiente">>({});
  const [despachando, setDespachando] = useState<Set<string>>(new Set());
  const enCrash = crashActivo(s.crash, now);

  const comandas: Comanda[] = useMemo(() => {
    const porPedido = new Map<string, PedidoItem[]>();
    for (const it of s.items) {
      if (it.estacion !== estacion || it.despachado_at || !["pendiente", "marchando", "listo"].includes(it.estado_cocina)) continue;
      if (despachando.has(it.pedido_id)) continue;
      porPedido.set(it.pedido_id, [...(porPedido.get(it.pedido_id) ?? []), it]);
    }
    const out: Comanda[] = [];
    for (const [pid, items] of porPedido) {
      const pedido = s.pedidos.find((p) => p.id === pid);
      if (!pedido) continue;
      const mesaObj = s.mesas.find((m) => m.id === pedido.mesa_id);
      const inicio = items.reduce((m, i) => (i.creado_at < m ? i.creado_at : m), items[0].creado_at);
      out.push({ pedido, items, mesa: mesaObj?.numero ?? null, sector: s.sectores.find((x) => x.id === mesaObj?.sector_id)?.nombre ?? (pedido.tipo === "delivery" ? "Delivery" : "Mostrador"), inicio, crash: pedido.en_market_crash || items.some((i) => i.en_market_crash) });
    }
    // Prioridad: crash y delivery primero dentro del mismo tramo, luego antigüedad
    // Puntaje = minutos de espera + bonus (crash +5, delivery +3): lo más urgente primero
    const ahora = Date.now();
    const prioridad = (c: Comanda) => minutosDesde(c.inicio, ahora) + (c.crash ? 5 : 0) + (c.pedido.tipo === "delivery" ? 3 : 0);
    return out.sort((a, b) => prioridad(b) - prioridad(a));
  }, [s.items, s.pedidos, s.mesas, s.sectores, estacion, despachando]);

  // Limpiar optimistas confirmados
  useEffect(() => {
    setOptimista((o) => {
      const n = { ...o };
      let cambio = false;
      for (const [id, est] of Object.entries(o)) {
        const it = s.items.find((x) => x.id === id);
        if (!it || it.estado_cocina === est || (est === "pendiente" && it.estado_cocina === "marchando")) { delete n[id]; cambio = true; }
      }
      return cambio ? n : o;
    });
    setDespachando((d) => {
      const n = new Set([...d].filter((pid) => s.items.some((i) => i.pedido_id === pid && i.estacion === estacion && !i.despachado_at && i.estado_cocina !== "anulado" && i.estado_cocina !== "entregado")));
      return n.size === d.size ? d : n;
    });
  }, [s.items, estacion]);

  // Sonido al entrar una comanda nueva y alerta suave para las rojas
  const vistos = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(comandas.map((c) => c.pedido.id));
    if (vistos.current && sonidoOn && [...ids].some((id) => !vistos.current!.has(id))) sonido.nuevaComanda();
    vistos.current = ids;
  }, [comandas, sonidoOn]);
  const rojas = comandas.filter((c) => minutosDesde(c.inicio, now) >= 18).length;
  const ultimaAlerta = useRef(0);
  useEffect(() => {
    if (rojas && sonidoOn && now - ultimaAlerta.current > 45_000) { sonido.alerta(); ultimaAlerta.current = now; }
  }, [rojas, sonidoOn, now]);

  const estadoItem = (it: PedidoItem) => optimista[it.id] ?? it.estado_cocina;

  async function tocarItem(it: PedidoItem) {
    const actual = estadoItem(it);
    const nuevo = actual === "listo" ? "pendiente" : "listo";
    setOptimista((o) => ({ ...o, [it.id]: nuevo }));
    sonido.tap();
    const err = await dispatch({ type: "itemEstado", item_id: it.id, estado: nuevo, usuario: sesion?.nombre });
    if (err) { setOptimista((o) => { const n = { ...o }; delete n[it.id]; return n; }); toast(err, "down"); }
  }
  async function marchar(c: Comanda) {
    for (const it of c.items.filter((i) => i.estado_cocina === "pendiente")) await dispatch({ type: "itemEstado", item_id: it.id, estado: "marchando", usuario: sesion?.nombre });
  }
  async function despachar(c: Comanda) {
    setDespachando((d) => new Set(d).add(c.pedido.id));
    sonido.listo();
    const err = await dispatch({ type: "despacharComanda", pedido_id: c.pedido.id, estacion, usuario: sesion?.nombre });
    if (err) { setDespachando((d) => { const n = new Set(d); n.delete(c.pedido.id); return n; }); toast(err, "down"); return; }
    toast(`#${c.pedido.numero} despachada en ${cronometro(now - new Date(c.inicio).getTime())} · aviso enviado al ${c.pedido.tipo === "delivery" ? "cadete" : "mozo"}`);
  }

  // Agrupador de producción
  const lotes = useMemo(() => {
    const m = new Map<string, { nombre: string; icono: string; cant: number; crash: boolean }>();
    for (const c of comandas) for (const it of c.items) {
      if (estadoItem(it) === "listo") continue;
      const p = s.productos.find((x) => x.id === it.producto_id);
      const prev = m.get(it.producto_id) ?? { nombre: it.nombre, icono: p?.icono ?? "burger", cant: 0, crash: false };
      m.set(it.producto_id, { ...prev, cant: prev.cant + it.cantidad, crash: prev.crash || it.en_market_crash });
    }
    return [...m.values()].sort((a, b) => b.cant - a.cant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comandas, optimista, s.productos]);

  const est = estimarEstacion(s, estacion, now);
  const criticos = estacion === "barra" ? s.insumos.filter((i) => i.rubro !== "Panadería" && nivelStock(i) !== "ok" && s.recetas.some((r) => r.insumo_id === i.id && s.productos.find((p) => p.id === r.producto_id)?.estacion === "barra")) : s.insumos.filter((i) => nivelStock(i) === "critico" && s.recetas.some((r) => r.insumo_id === i.id && s.productos.find((p) => p.id === r.producto_id)?.estacion === "cocina"));

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      {/* barra de estado */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel/60 px-4 py-2">
        {estacion === "cocina" ? <ChefHat size={18} className="text-up" /> : <Martini size={18} className="text-up" />}
        <span className="text-sm font-semibold">{comandas.length} comandas</span>
        <Badge tono="up">{comandas.filter((c) => semaforo(minutosDesde(c.inicio, now)) === "verde").length} en tiempo</Badge>
        <Badge tono="warn">{comandas.filter((c) => semaforo(minutosDesde(c.inicio, now)) === "amarillo").length} atención</Badge>
        <Badge tono="down">{rojas} demoradas</Badge>
        <span className="flex-1" />
        {enCrash && <Badge tono="crash" dot className="animate-blink">Market Crash · {cronometro(new Date(s.crash!.fin_at).getTime() - now)} restantes</Badge>}
        <button onClick={() => { setSonidoOn((v) => !v); sonido.desbloquear(); }} className={cx("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs", sonidoOn ? "border-warn/50 text-warn" : "border-line text-mute")}>
          {sonidoOn ? <Volume2 size={14} /> : <VolumeX size={14} />} Alerta sonora: {sonidoOn ? "ON" : "OFF"}
        </button>
      </div>
      {enCrash && estacion === "barra" && (
        <div className="flex items-center gap-3 border-b border-crash/40 bg-crash/10 px-4 py-2 text-sm">
          <Zap size={16} className="text-crash" /><b className="text-crash">ALTA DEMANDA</b>
          <span className="text-ink/80">{s.crash!.productos.map((id) => s.productos.find((p) => p.id === id)?.nombre).join(", ")} a precio piso · priorizá estos tragos</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* comandas */}
        <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-1 gap-3 overflow-y-auto p-3 scroll-thin sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {comandas.length === 0 && <div className="col-span-full"><Empty icon={<Check size={36} className="text-up" />} title="Todo despachado" hint="Las comandas nuevas aparecen acá al instante con aviso sonoro." /></div>}
          {comandas.map((c) => {
            const min = minutosDesde(c.inicio, now);
            const sem = SEM[semaforo(min)];
            const todosListos = c.items.every((i) => estadoItem(i) === "listo");
            const algunoPendiente = c.items.some((i) => i.estado_cocina === "pendiente");
            return (
              <article key={c.pedido.id} className={cx("flex flex-col rounded-2xl border-2 p-3 animate-slideIn", sem.borde, sem.fondo, semaforo(min) === "rojo" && "animate-pulseRing")}>
                <header className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 font-mono text-xl font-bold">
                      #{c.pedido.numero}
                      {c.crash && <span className="flex items-center gap-1 rounded-md bg-crash px-1.5 py-0.5 text-[10px] font-black text-black"><Zap size={11} />CRASH</span>}
                      {c.pedido.tipo === "delivery" && <span className="flex items-center gap-1 rounded-md bg-violet/20 px-1.5 py-0.5 text-[10px] font-bold text-violet"><Bike size={11} />DELIVERY</span>}
                    </div>
                    <div className="text-sm font-semibold">{c.mesa ? `Mesa ${String(c.mesa).padStart(2, "0")}` : c.pedido.tipo === "delivery" ? `#D-${c.pedido.numero}` : "Mostrador"} · <span className="text-mute">{c.sector}</span>{c.pedido.tipo === "webapp_qr" && <span className="ml-1 text-info">· QR</span>}</div>
                  </div>
                  <div className="text-right">
                    <div className={cx("font-mono text-2xl font-bold tabular-nums", sem.texto, semaforo(min) === "rojo" && "animate-blink")}>{cronometro(now - new Date(c.inicio).getTime())}</div>
                    <span className={cx("rounded-full border px-2 py-0.5 text-[10px] font-bold", sem.borde, sem.texto)}>{sem.label}</span>
                  </div>
                </header>

                <ul className="mt-3 flex flex-col gap-1.5">
                  {c.items.map((it) => {
                    const listo = estadoItem(it) === "listo";
                    const receta = estacion === "barra" ? s.recetas.filter((r) => r.producto_id === it.producto_id).map((r) => { const i = s.insumos.find((x) => x.id === r.insumo_id); return i && i.nombre !== "Hielo" ? `${i.nombre} ${r.cantidad.toLocaleString("es-AR")}${i.unidad === "u" ? " u." : " " + i.unidad}` : null; }).filter(Boolean).join(" · ") : null;
                    const icono = s.productos.find((p) => p.id === it.producto_id)?.icono ?? "burger";
                    return (
                      <li key={it.id}>
                        <button onClick={() => tocarItem(it)} className={cx("flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.98]", listo ? "border-up/40 bg-up/10" : "border-line bg-bg/70 hover:border-mute")}>
                          {estacion === "barra" && <ProductIcon icono={icono} size={40} />}
                          <span className="min-w-0 flex-1">
                            <span className={cx("block text-base font-semibold leading-tight", listo && "text-up line-through decoration-2")}>
                              <span className="font-mono">{it.cantidad}×</span> {it.nombre}
                              {it.estado_cocina === "marchando" && !listo && <Flame size={14} className="ml-1 inline text-warn" />}
                            </span>
                            {(it.modificadores.length > 0 || it.notas) && <span className="mt-0.5 block text-xs font-medium text-warn">{[...it.modificadores.map((m) => m.nombre), it.notas].filter(Boolean).join(" · ")}</span>}
                            {receta && <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-mute">{receta}</span>}
                          </span>
                          <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-full border-2", listo ? "border-up bg-up text-black" : "border-line text-transparent")}><Check size={16} strokeWidth={3} /></span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Btn size="lg" variant="ghost" disabled={!algunoPendiente} onClick={() => marchar(c)}><Flame size={18} />{estacion === "barra" ? "Preparando" : "Marchando"}</Btn>
                  <Btn size="lg" variant={semaforo(min) === "rojo" ? "danger" : semaforo(min) === "amarillo" ? "warn" : "primary"} onClick={() => despachar(c)}>
                    <Check size={18} />{todosListos ? "Despachar" : "Listo"}
                  </Btn>
                </div>
              </article>
            );
          })}
        </div>

        {/* lateral */}
        <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-panel/40 p-3 scroll-thin md:flex">
          <div>
            <div className="eyebrow mb-2">Agrupado por {estacion === "cocina" ? "plato" : "trago"} · en total marchando</div>
            <ul className="flex flex-col gap-1.5">
              {lotes.length === 0 && <li className="rounded-xl border border-line p-3 text-sm text-mute">Sin pendientes</li>}
              {lotes.map((l) => (
                <li key={l.nombre} className={cx("flex items-center gap-3 rounded-xl border bg-card px-3 py-2", l.crash ? "border-crash/50" : "border-line")}>
                  <ProductIcon icono={l.icono} size={34} />
                  <span className="flex-1 text-sm font-medium leading-tight">{l.nombre}{l.crash && <Zap size={12} className="ml-1 inline text-crash" />}</span>
                  <span className="font-mono text-2xl font-bold text-up">{l.cant}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-line bg-card p-3">
            <div className="eyebrow">Tiempo promedio del turno</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold">{cronometro(est.demora_prom_turno_min * 60000)}</span>
              <span className={cx("font-mono text-xs", est.demora_prom_turno_min <= est.demora_objetivo_min ? "text-up" : "text-warn")}>obj. {cronometro(est.demora_objetivo_min * 60000)}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-mute"><Timer size={13} />ETA pedido nuevo: <b className="font-mono text-ink">{Math.round(est.eta_nuevo_pedido_min)} min</b></div>
          </div>

          {estacion === "barra" && (
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="eyebrow mb-2">Cotización en vivo</div>
              <ul className="flex flex-col gap-1">
                {s.productos.filter((p) => p.estacion === "barra" && p.es_cotizable_bolsa).slice(0, 7).map((p) => (
                  <li key={p.id} className="flex justify-between text-sm"><span>{p.nombre}</span><span className={cx("font-mono", p.variacion_porcentaje >= 0 ? "text-up" : "text-down")}>{money(p.precio_actual)} {p.variacion_porcentaje >= 0 ? "▲" : "▼"}</span></li>
                ))}
              </ul>
            </div>
          )}

          {criticos.length > 0 && (
            <div className="rounded-xl border border-line bg-card p-3">
              <div className="eyebrow mb-2">Stock crítico</div>
              <ul className="flex flex-col gap-1 text-sm">
                {criticos.slice(0, 6).map((i) => (
                  <li key={i.id} className="flex items-center gap-2"><span className={cx("h-2 w-2 rounded-full", nivelStock(i) === "critico" ? "bg-down" : "bg-warn")} />{i.nombre} · <span className="font-mono text-mute">{cantidad(i.stock_actual, i.unidad)}</span></li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
