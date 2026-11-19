"use client";
// =============================================================================
//  FASE 7.4 · Panel de IA del dashboard
//  · 3 alertas proactivas del motor estadístico con "Aplicar en 1 clic"
//  · Chat copiloto (Claude + tool use) con preguntas sugeridas y gráficos
// =============================================================================
import { useEffect, useRef, useState } from "react";
import { Bot, Check, Loader2, Send, ShoppingCart, Sparkles, Timer, TrendingDown, X, Zap, Megaphone } from "lucide-react";
import { Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Btn, toast } from "@/components/ui/kit";
import { useBackend, useDispatch, useNexo, useSesion } from "@/lib/store/NexoProvider";
import { generarRecomendaciones } from "@/lib/ai/learningEngine";
import type { Grafico, Propuesta, Snapshot } from "@/lib/ai/copilotTools";
import type { IaRecomendacion, NexoState } from "@/lib/types";
import { cx, money } from "@/lib/format";

const ICONO: Record<IaRecomendacion["tipo"], React.ReactNode> = {
  compra: <ShoppingCart size={16} />, market_crash: <Zap size={16} />, promo: <Megaphone size={16} />, demora_cocina: <Timer size={16} />,
  upsell: <Sparkles size={16} />, precio: <TrendingDown size={16} />, anomalia: <TrendingDown size={16} />,
};
const SUGERIDAS = [
  "¿Qué trago me dejó más ganancia hoy?",
  "Armame una promo para liquidar el stock de fernet",
  "¿Qué cocinero tuvo mejores tiempos?",
  "¿Qué tengo que comprar para el fin de semana?",
];

interface Msg { role: "user" | "assistant"; content: string; graficos?: Grafico[]; propuestas?: Propuesta[]; modo?: string }

/** Ejecuta una acción de la IA (recomendación o propuesta del copiloto) previa confirmación del usuario. */
function useAplicar() {
  const dispatch = useDispatch();
  const backend = useBackend();
  const sesion = useSesion();
  return async (accion: Record<string, unknown>): Promise<string | null> => {
    const s = backend.getState()!;
    const tipo = (accion.tipo as string) ?? "";
    if (tipo === "compra") {
      const items = (accion.items as { insumo_id: string; cantidad: number }[]) ?? [];
      for (const it of items) {
        const i = s.insumos.find((x) => x.id === it.insumo_id);
        if (i) { const e = await dispatch({ type: "compraInsumo", insumo_id: i.id, cantidad: it.cantidad, costo_unitario: i.costo_unitario, usuario: sesion?.nombre }); if (e) return e; }
      }
      return null;
    }
    if (tipo === "market_crash") {
      const ids = ((accion.productos ?? accion.producto_ids) as string[] | undefined)?.filter((id) => s.productos.some((p) => p.id === id)) ?? [];
      return dispatch({ type: "marketCrash", ids, mensaje: "Oferta relámpago", minutos: Number(accion.minutos) || 10, descuento_pct: (accion.descuento_pct as number) ?? null, usuario: sesion?.nombre });
    }
    if (tipo === "promo") {
      const ids = (accion.producto_ids as string[] | undefined) ?? [];
      const cat = (accion.categoria_id as string) ?? s.productos.find((p) => p.id === ids[0])?.categoria_id ?? s.categorias[0].id;
      return dispatch({ type: "guardarPromo", promo: { titulo: String(accion.titulo ?? "Promo IA"), tipo: "descuento", descuento_pct: Number(accion.descuento_pct) || 20, categoria_id: cat, dias: [0, 1, 2, 3, 4, 5, 6], hora_desde: (accion.hora_desde as string) ?? "22:00", hora_hasta: (accion.hora_hasta as string) ?? "23:59", activa: true } });
    }
    if (tipo === "destacar") return null;
    if (tipo === "aviso_mozos") return dispatch({ type: "log", nivel: "warn", origen: "ia", mensaje: `Aviso a mozos: demora proyectada en ${accion.estacion} (ETA ${accion.eta} min)` });
    return null;
  };
}

export function AiAssistantPanel({ className }: { className?: string }) {
  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <AlertasProactivas />
      <ChatCopiloto />
    </div>
  );
}

function AlertasProactivas() {
  const s = useNexo();
  const dispatch = useDispatch();
  const aplicar = useAplicar();
  const pendientes = s.recomendaciones.filter((r) => r.estado === "pendiente").slice(0, 3);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    if (!s.recomendaciones.some((r) => r.estado === "pendiente")) dispatch({ type: "nuevasRecomendaciones", items: generarRecomendaciones(s) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="rounded-2xl border border-violet/30 bg-gradient-to-br from-violet/10 via-card/80 to-card/80 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} className="text-violet" />Acciones recomendadas hoy</h3>
        <Btn size="sm" variant="outline" onClick={() => dispatch({ type: "nuevasRecomendaciones", items: generarRecomendaciones(s) })}>Recalcular</Btn>
      </header>
      {!pendientes.length && <p className="text-sm text-mute">Todo en orden por ahora. La IA revisa ventas, stock y tiempos cada minuto.</p>}
      <ul className="flex flex-col gap-2">
        {pendientes.map((r) => (
          <li key={r.id} className="animate-slideIn rounded-xl border border-line bg-bg/60 p-3">
            <div className="flex items-start gap-3">
              <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg", r.prioridad === 1 ? "bg-down/15 text-down" : r.prioridad === 2 ? "bg-warn/15 text-warn" : "bg-info/15 text-info")}>{ICONO[r.tipo]}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{r.titulo}</div>
                <p className="mt-0.5 text-xs leading-relaxed text-mute">{r.detalle}</p>
              </div>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Btn size="sm" variant="ghost" onClick={() => dispatch({ type: "recomendacion", id: r.id, estado: "descartada" })}><X size={13} />Descartar</Btn>
              <Btn size="sm" variant="primary" disabled={ocupado === r.id} onClick={async () => {
                setOcupado(r.id);
                const e = await aplicar(r.accion);
                setOcupado(null);
                if (e) return toast(e, "down");
                await dispatch({ type: "recomendacion", id: r.id, estado: "aplicada" });
                toast("Aplicado. Queda registrado para medir el impacto");
              }}>{ocupado === r.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Aplicar en 1 clic</Btn>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-3 text-[11px] text-mute">
        <span>Aplicadas hoy: <b className="text-ink">{s.recomendaciones.filter((r) => r.estado === "aplicada").length}</b></span>
        <span>Descartadas: <b className="text-ink">{s.recomendaciones.filter((r) => r.estado === "descartada").length}</b></span>
      </div>
    </section>
  );
}

function snapshotDe(s: NexoState): Snapshot {
  const t0 = Date.now() - 56 * 86400_000;
  const pedidos = s.pedidos.filter((p) => new Date(p.created_at).getTime() >= t0);
  const ids = new Set(pedidos.map((p) => p.id));
  return {
    bar: s.bar, productos: s.productos, categorias: s.categorias, insumos: s.insumos, recetas: s.recetas, pedidos,
    items: s.items.filter((i) => ids.has(i.pedido_id)).map((i) => ({ ...i, notas: null })), usuarios: s.usuarios.map((u) => ({ ...u, pin: "" })),
    mermas: s.mermas, turnos: [], movimientos: [], crash: s.crash, promociones: s.promociones, fotos: [],
  };
}

function ChatCopiloto() {
  const backend = useBackend();
  const aplicar = useAplicar();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  useEffect(() => { fin.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [msgs, cargando]);

  async function preguntar(q: string) {
    if (!q.trim() || cargando) return;
    const nuevos: Msg[] = [...msgs, { role: "user", content: q.trim() }];
    setMsgs(nuevos); setTexto(""); setCargando(true);
    try {
      const r = await fetch("/api/ai-copilot", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: nuevos.map(({ role, content }) => ({ role, content })), snapshot: backend.modo === "demo" ? snapshotDe(backend.getState()!) : undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Error");
      setMsgs((m) => [...m, { role: "assistant", content: j.texto, graficos: j.graficos, propuestas: j.propuestas, modo: j.modo }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: `${e instanceof Error ? e.message : "No pude responder"}` }]);
    } finally { setCargando(false); }
  }

  return (
    <section className="flex min-h-[420px] flex-col rounded-2xl border border-line bg-card/80">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Bot size={16} className="text-up" />Copiloto</h3>
        <Badge tono="mute">Claude · solo lectura</Badge>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 scroll-thin" style={{ maxHeight: 520 }}>
        {!msgs.length && (
          <div>
            <p className="text-sm text-mute">Preguntale a tu negocio en lenguaje natural. Consulta ventas, recetas, stock y tiempos del KDS de tu bar.</p>
            <div className="mt-3 flex flex-col gap-2">
              {SUGERIDAS.map((q) => <button key={q} onClick={() => preguntar(q)} className="rounded-xl border border-line px-3 py-2 text-left text-sm text-ink/90 transition hover:border-up/50 hover:text-up">{q}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div className={cx("max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed", m.role === "user" ? "bg-up/15 text-ink" : "border border-line bg-bg/70")}>
              <Markdown texto={m.content} />
              {m.graficos?.map((g, k) => <MiniGrafico key={k} g={g} />)}
              {m.propuestas?.map((p, k) => (
                <div key={k} className="mt-2 rounded-xl border border-violet/40 bg-violet/5 p-2.5">
                  <div className="text-xs text-mute">{p.motivo}</div>
                  <Btn size="sm" variant="primary" className="mt-2" onClick={async () => {
                    const pl = p.payload as Record<string, unknown>;
                    const e = await aplicar({ ...pl, tipo: p.tipo, productos: pl.producto_ids, titulo: p.titulo });
                    toast(e ?? `Aplicado: ${p.titulo}`, e ? "down" : "up");
                  }}><Check size={13} />Confirmar: {p.titulo}</Btn>
                </div>
              ))}
              {m.modo === "local" && <div className="mt-1 text-[10px] text-dim">respuesta local (sin API key)</div>}
            </div>
          </div>
        ))}
        {cargando && <div className="flex items-center gap-2 text-sm text-mute"><Loader2 size={14} className="animate-spin" />Analizando tus datos…</div>}
        <div ref={fin} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); preguntar(texto); }} className="flex gap-2 border-t border-line p-3">
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej: ¿cuánto vendí de Gin Tonic esta semana?" className="h-11 flex-1 rounded-xl border border-line bg-bg px-3 text-sm focus:border-up/60 focus:outline-none" />
        <Btn variant="primary" type="submit" disabled={cargando || !texto.trim()} aria-label="Enviar"><Send size={16} /></Btn>
      </form>
    </section>
  );
}

function Markdown({ texto }: { texto: string }) {
  // Markdown mínimo y seguro: **negrita** y saltos de línea (sin HTML)
  return (
    <>
      {texto.split("\n").map((linea, i) => (
        <p key={i} className={i ? "mt-1.5" : ""}>
          {linea.split(/(\*\*[^*]+\*\*)/g).map((t, j) => t.startsWith("**") && t.endsWith("**") ? <b key={j} className="text-up">{t.slice(2, -2)}</b> : <span key={j}>{t.replace(/^[-•]\s/, "• ")}</span>)}
        </p>
      ))}
    </>
  );
}

function MiniGrafico({ g }: { g: Grafico }) {
  const fmt = (v: number) => (g.unidad === "$" ? money(v) : `${v.toLocaleString("es-AR")}${g.unidad ? ` ${g.unidad}` : ""}`);
  return (
    <div className="mt-3 rounded-xl border border-line bg-panel p-2">
      <div className="mb-1 px-1 text-xs font-semibold">{g.titulo}</div>
      <div className="h-40">
        <ResponsiveContainer>
          {g.tipo === "linea" ? (
            <LineChart data={g.datos} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <XAxis dataKey="x" tick={{ fill: "#8a97a6", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ background: "#0c1117", border: "1px solid #1e2a36", borderRadius: 10, fontSize: 12 }} />
              <Line dataKey="y" stroke="#1ee08f" strokeWidth={2} dot={false} />
            </LineChart>
          ) : (
            <BarChart data={g.datos} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="x" width={110} tick={{ fill: "#c9d3dd", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => fmt(Number(v))} cursor={{ fill: "rgba(255,255,255,.04)" }} contentStyle={{ background: "#0c1117", border: "1px solid #1e2a36", borderRadius: 10, fontSize: 12 }} />
              <Bar dataKey="y" fill="#1ee08f" radius={[0, 6, 6, 0]} barSize={12} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
