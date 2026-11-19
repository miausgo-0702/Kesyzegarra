"use client";
// =============================================================================
//  FASE 2 · Pantalla pública del salón — modo bolsa NYSE
//  Fondo negro puro, JetBrains Mono, reloj gigante, 4 gráficos estrella,
//  cotizaciones completas, muro social con votación y ticker inferior.
//  Tiempo real: Supabase Realtime (producción) o sincronización local (demo).
// =============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize, Music, Star, Trophy, Volume2, VolumeX, Zap } from "lucide-react";
import { useNexo, useNow } from "@/lib/store/NexoProvider";
import { Sparkline } from "@/components/ui/Sparkline";
import { FotoView, ProductIcon } from "@/components/icons/ProductIcon";
import { QR } from "@/components/ui/QR";
import { cronometro, cx, fechaCorta, hhmm, money } from "@/lib/format";
import { crashActivo } from "@/lib/exchangeEngine";
import { sonido } from "@/lib/sound";
import type { Producto } from "@/lib/types";

const NEON = "text-neon";
const RED = "text-crash";

export default function PantallaTV({ params }: { params: Promise<{ barId: string }> }) {
  const s = useNexo();
  const now = useNow(1000);
  const [sonidoOn, setSonidoOn] = useState(false);
  const [slug, setSlug] = useState("bar-central");
  useEffect(() => { params.then((p) => setSlug(p.barId)); }, [params]);

  const enCrash = crashActivo(s.crash, now);
  const crashId = enCrash ? s.crash!.id : null;
  const prevCrash = useRef<string | null>(null);
  useEffect(() => {
    if (crashId && crashId !== prevCrash.current && sonidoOn) sonido.crash();
    prevCrash.current = crashId;
  }, [crashId, sonidoOn]);

  const cotizables = s.productos.filter((p) => p.activo && p.es_cotizable_bolsa);
  // 4 estrellas: destacados + los de mayor movimiento
  const estrellas = useMemo(() => {
    const dest = cotizables.filter((p) => p.destacado);
    const resto = cotizables.filter((p) => !p.destacado).sort((a, b) => Math.abs(b.variacion_porcentaje) - Math.abs(a.variacion_porcentaje));
    return [...dest, ...resto].slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cotizables.map((p) => p.id + p.destacado).join()]);

  const ganadora = s.fotos.find((f) => f.es_ganadora && now - new Date(f.created_at).getTime() < 12 * 3600_000);
  const ranking = s.fotos.filter((f) => f.estado === "aprobada").sort((a, b) => b.votos_count - a.votos_count);
  const maxVotos = Math.max(1, ...ranking.map((f) => f.votos_count));
  const [fotoIdx, setFotoIdx] = useState(0);
  useEffect(() => { const t = setInterval(() => setFotoIdx((i) => i + 1), 6000); return () => clearInterval(t); }, []);
  const fotoActual = ranking.length ? ranking[fotoIdx % ranking.length] : null;
  const proxEventos = s.eventos.filter((e) => e.estado === "publicado" && new Date(e.fecha).getTime() > now - 3 * 3600_000).slice(0, 4);
  const promos = s.promociones.filter((p) => p.activa);
  const urlMenu = typeof window !== "undefined" ? `${window.location.origin}/menu/${slug}/12` : `/menu/${slug}/12`;

  return (
    <div className={cx("relative flex h-dvh min-h-[640px] flex-col overflow-hidden bg-black font-mono text-white", enCrash && "shadow-[inset_0_0_0_6px_#FF3333]")}
      onClick={() => { if (!sonidoOn) { sonido.desbloquear(); setSonidoOn(true); } }}>
      {/* ---------- Encabezado ---------- */}
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-white/10 px-[2.2vw] py-[1.4vh]">
        <div className="flex items-center gap-4">
          <span className="font-sans text-[clamp(22px,2.4vw,52px)] font-extrabold tracking-tight">NE<span className="text-neon">X</span>ORESTO</span>
          <span className="flex items-center gap-2 rounded-full border border-neon/40 bg-neon/10 px-3 py-1 text-[clamp(10px,0.8vw,15px)] font-bold text-neon"><span className="h-2 w-2 animate-blink rounded-full bg-neon" />EN VIVO</span>
          <span className="hidden rounded-full border border-white/15 px-3 py-1 text-[clamp(10px,0.8vw,15px)] text-white/60 md:inline">VENTANA {s.bar.reglas_precios.ventana_min} MIN</span>
        </div>
        <div className="flex items-center gap-6">
          <span className="hidden text-[clamp(12px,1.1vw,22px)] text-white/50 sm:inline">{fechaCorta(now)} {new Date(now).getFullYear()}</span>
          <span className="text-[clamp(34px,4.6vw,96px)] font-bold leading-none tabular-nums tracking-tight">
            {new Date(now).toLocaleTimeString("es-AR", { hour12: false })}
          </span>
          <div className="flex flex-col gap-1">
            <button onClick={(e) => { e.stopPropagation(); setSonidoOn((v) => !v); sonido.desbloquear(); }} className="grid h-8 w-8 place-items-center rounded-full text-white/40 hover:text-white" aria-label="Sonido">{sonidoOn ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
            <button onClick={(e) => { e.stopPropagation(); document.documentElement.requestFullscreen?.(); }} className="grid h-8 w-8 place-items-center rounded-full text-white/40 hover:text-white" aria-label="Pantalla completa"><Maximize size={16} /></button>
          </div>
        </div>
      </header>

      {/* ---------- Banner Market Crash ---------- */}
      {enCrash && (
        <div className="flex items-center justify-between gap-4 bg-crash px-[2.2vw] py-[1vh] text-black">
          <span className="animate-blink text-[clamp(18px,2.2vw,44px)] font-extrabold tracking-tight"><Zap className="mr-2 inline h-[0.9em] w-[0.9em] -translate-y-[0.08em]" strokeWidth={3} />{s.crash!.mensaje.toUpperCase()}</span>
          <span className="text-[clamp(12px,1.1vw,22px)] font-bold">{s.crash!.productos.length} PRODUCTOS A PRECIO PISO · TERMINA EN</span>
          <span className="text-[clamp(22px,2.6vw,52px)] font-extrabold tabular-nums">{cronometro(new Date(s.crash!.fin_at).getTime() - now)}</span>
        </div>
      )}

      {/* ---------- Cuerpo ---------- */}
      <main className="grid min-h-0 flex-1 grid-cols-12 gap-[1vw] px-[2.2vw] py-[1.6vh]">
        <section className="col-span-12 flex min-h-0 flex-col gap-[1vw] lg:col-span-9">
          {!cotizables.length && <div className="grid flex-1 place-items-center rounded-2xl border border-white/10 text-center font-sans text-[clamp(16px,1.6vw,30px)] text-white/60">La carta todavía no tiene productos en cotización.</div>}
          <div className={cx("grid min-h-0 flex-[1.15] grid-cols-2 gap-[1vw] xl:grid-cols-4", !cotizables.length && "hidden")}>
            {estrellas.map((p) => <TarjetaEstrella key={p.id} p={p} hist={s.historial[p.id] ?? []} crash={enCrash && !!s.crash?.productos.includes(p.id)} />)}
          </div>
          <TablaCotizaciones productos={cotizables} crashIds={enCrash ? s.crash!.productos : []} />
        </section>

        <aside className="col-span-12 hidden min-h-0 flex-col gap-[1vw] lg:col-span-3 lg:flex">
          <div className="flex min-h-0 flex-[1.3] flex-col rounded-2xl border border-white/10 bg-[#05080c] p-[1vw]">
            <div className="mb-2 text-[clamp(9px,0.7vw,14px)] font-semibold tracking-[0.18em] text-white/50">FOTO DE LA NOCHE · RANKING EN VIVO</div>
            {ganadora ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <div className="text-[clamp(12px,1vw,20px)] font-bold text-neon"><Trophy className="mr-1.5 inline h-[1em] w-[1em] -translate-y-[0.1em]" />GANADORA · MESA {ganadora.mesa_numero}</div>
                <FotoView url={ganadora.url_foto} size={170} className="rounded-xl" />
                <div className="text-[clamp(10px,0.8vw,15px)] text-white/60">{ganadora.votos_count} votos · cupón enviado a la mesa</div>
              </div>
            ) : fotoActual ? (
              <div className="flex min-h-0 flex-1 gap-3">
                <div key={fotoActual.id} className="flex animate-slideIn flex-col items-center gap-2">
                  <FotoView url={fotoActual.url_foto} size={150} className="rounded-xl" />
                  <div className="text-center text-[clamp(10px,0.75vw,14px)] text-white/60">MESA {String(fotoActual.mesa_numero ?? "-").padStart(2, "0")}</div>
                  <div className="rounded-md border border-neon/40 px-2 py-0.5 text-[clamp(11px,0.9vw,17px)] font-bold text-neon">VOTO {fotoActual.codigo_voto}</div>
                </div>
                <ol className="flex min-w-0 flex-1 flex-col justify-center gap-3">
                  {ranking.slice(0, 3).map((f, i) => (
                    <li key={f.id}>
                      <div className="flex justify-between text-[clamp(10px,0.85vw,16px)]"><span>#{i + 1} Mesa {String(f.mesa_numero).padStart(2, "0")}</span><span className="tabular-nums text-neon">{f.votos_count}</span></div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-neon transition-all duration-700" style={{ width: `${(f.votos_count / maxVotos) * 100}%` }} /></div>
                    </li>
                  ))}
                </ol>
              </div>
            ) : <div className="grid flex-1 place-items-center text-white/40">Subí tu foto desde la carta QR</div>}
          </div>

          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-[#05080c] p-[1vw]">
            <div className="mb-2 text-[clamp(9px,0.7vw,14px)] font-semibold tracking-[0.18em] text-white/50">CARTELERA · ESTA SEMANA</div>
            <ul className="flex-1 divide-y divide-white/10 overflow-hidden">
              {proxEventos.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 py-[0.8vh] font-sans">
                  <span className="min-w-0 truncate text-[clamp(11px,0.95vw,18px)]"><b>{e.titulo}</b> <span className="text-white/50">{e.subtitulo}</span></span>
                  <span className="shrink-0 font-mono text-[clamp(10px,0.85vw,16px)] text-white/60">{fechaCorta(e.fecha).split(" ")[0]} {hhmm(e.fecha)}</span>
                </li>
              ))}
              {promos.slice(0, 2).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-[0.8vh] font-sans">
                  <span className="truncate text-[clamp(11px,0.95vw,18px)]"><b>{p.titulo}</b></span>
                  <span className="shrink-0 font-mono text-[clamp(10px,0.85vw,16px)] text-white/60">{p.hora_desde}–{p.hora_hasta}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#05080c] p-[0.8vw]">
            <QR value={urlMenu} size={84} className="shrink-0 overflow-hidden rounded-lg" />
            <div className="font-sans text-[clamp(11px,0.9vw,17px)] leading-snug text-white/70">
              <b className="text-white">Pedí, subí tu foto y votá</b><br />Escaneá el QR de tu mesa. 1 voto por ronda; la foto ganadora recibe un cupón.
            </div>
          </div>
        </aside>
      </main>

      <Ticker />
    </div>
  );
}

function TarjetaEstrella({ p, hist, crash }: { p: Producto; hist: { t: number; p: number }[]; crash: boolean }) {
  const subiendo = p.precio_actual >= (hist[0]?.p ?? p.precio_base);
  const cambio = p.precio_anterior && p.precio_anterior !== p.precio_actual ? (p.precio_actual > p.precio_anterior ? "up" : "down") : null;
  return (
    <div className={cx("relative flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-[#05080c] p-[1vw]", crash ? "border-crash animate-pulseRing" : "border-white/10")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[clamp(13px,1.15vw,24px)] font-semibold uppercase tracking-wider">{p.nombre}</div>
          <div key={p.precio_actual} className={cx("mt-[0.8vh] inline-block rounded px-1 text-[clamp(22px,2.5vw,60px)] font-bold leading-none tabular-nums", subiendo ? NEON : RED, cambio === "up" && "animate-flashUp", cambio === "down" && "animate-flashDown")}>
            {money(p.precio_actual)}
          </div>
          <div className={cx("mt-1 text-[clamp(12px,1.05vw,22px)] tabular-nums", p.variacion_porcentaje >= 0 ? NEON : RED)}>
            {p.variacion_porcentaje >= 0 ? "▲ +" : "▼ −"}{Math.abs(p.variacion_porcentaje).toFixed(1).replace(".", ",")}%
          </div>
        </div>
        <ProductIcon icono={p.icono} size={78} className="hidden shrink-0 2xl:inline-grid" />
      </div>
      {crash && <div className="absolute right-3 top-3 rounded bg-crash px-2 py-0.5 text-[11px] font-black text-black">CRASH</div>}
      <div className="mt-auto min-h-[60px] flex-1 pt-[1vh]"><Sparkline data={hist} up={subiendo} height="100%" neon /></div>
    </div>
  );
}

function TablaCotizaciones({ productos, crashIds }: { productos: Producto[]; crashIds: string[] }) {
  const mitad = Math.ceil(productos.length / 2);
  const cols = [productos.slice(0, mitad), productos.slice(mitad)];
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-[1vw] overflow-hidden rounded-2xl border border-white/10 bg-[#05080c] p-[1vw] md:grid-cols-2">
      {cols.map((col, ci) => (
        <table key={ci} className="w-full self-start text-[clamp(12px,1.05vw,21px)]">
          <thead>
            <tr className="text-left text-[clamp(9px,0.7vw,13px)] tracking-[0.16em] text-white/40">
              <th className="pb-[0.6vh] font-semibold">PRODUCTO</th>
              <th className="pb-[0.6vh] text-right font-semibold">ANTERIOR</th>
              <th className="pb-[0.6vh] text-right font-semibold">ACTUAL</th>
              <th className="pb-[0.6vh] text-right font-semibold">VAR.</th>
            </tr>
          </thead>
          <tbody>
            {col.map((p) => {
              const up = p.precio_actual >= (p.precio_anterior ?? p.precio_actual);
              const cr = crashIds.includes(p.id);
              return (
                <tr key={p.id} className="border-t border-white/[0.06]">
                  <td className="truncate py-[0.55vh] pr-2 font-semibold uppercase">{cr && <Zap className="mr-1 inline h-[0.85em] w-[0.85em] -translate-y-[0.08em] text-crash" strokeWidth={3} />}{p.nombre}</td>
                  <td className="py-[0.55vh] text-right tabular-nums text-white/45">{p.precio_anterior ? money(p.precio_anterior) : "—"}</td>
                  <td key={p.precio_actual} className={cx("py-[0.55vh] text-right font-bold tabular-nums", up ? NEON : RED, up ? "animate-flashUp" : "animate-flashDown")}>{money(p.precio_actual)}</td>
                  <td className={cx("py-[0.55vh] text-right tabular-nums", p.variacion_porcentaje >= 0 ? NEON : RED)}>{p.variacion_porcentaje >= 0 ? "▲" : "▼"} {Math.abs(p.variacion_porcentaje).toFixed(1).replace(".", ",")}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
    </div>
  );
}

function Ticker() {
  const s = useNexo();
  const now = useNow(5000);
  const enCrash = crashActivo(s.crash, now);
  const piezas: { k: string; node: React.ReactNode }[] = [];
  if (enCrash) piezas.push({ k: "crash", node: <span className="font-black text-crash"><Zap className="mr-2 inline h-[0.9em] w-[0.9em] -translate-y-[0.08em]" strokeWidth={3} />MARKET CRASH · {s.crash!.mensaje.toUpperCase()} · PRECIOS MÍNIMOS POR TIEMPO LIMITADO</span> });
  for (const p of s.productos.filter((x) => x.es_cotizable_bolsa)) {
    const up = p.variacion_porcentaje >= 0;
    piezas.push({ k: p.id, node: <span><b>{p.nombre.toUpperCase()}</b> <span className="text-white/80">{money(p.precio_actual)}</span> <span className={up ? NEON : RED}>{up ? "▲ +" : "▼ −"}{Math.abs(p.variacion_porcentaje).toFixed(1).replace(".", ",")}%</span></span> });
  }
  for (const pr of s.promociones.filter((x) => x.activa)) piezas.push({ k: pr.id, node: <span className="text-warn"><Star className="mr-2 inline h-[0.8em] w-[0.8em] -translate-y-[0.08em]" />{pr.titulo.toUpperCase()} {pr.hora_desde}–{pr.hora_hasta}</span> });
  for (const e of s.eventos.filter((x) => x.estado === "publicado").slice(0, 3)) piezas.push({ k: e.id, node: <span className="text-info"><Music className="mr-2 inline h-[0.8em] w-[0.8em] -translate-y-[0.08em]" />{e.titulo.toUpperCase()} · {fechaCorta(e.fecha)} {hhmm(e.fecha)}</span> });
  const fila = piezas.map((x) => <span key={x.k} className="mx-[2vw] inline-block">{x.node}</span>);
  return (
    <footer className={cx("relative overflow-hidden whitespace-nowrap border-t py-[1.3vh] text-[clamp(14px,1.5vw,30px)]", enCrash ? "border-crash bg-crash/10" : "border-neon/20 bg-[#03140b]")}>
      <div className="inline-block animate-marquee" style={{ animationDuration: `${Math.max(40, piezas.length * 5)}s` }}>{fila}{fila}</div>
    </footer>
  );
}
