"use client";
// =============================================================================
//  FASE 5.2 · Panel del Community Manager
//  Moderación en 1 clic · Market Crash (botón rojo) · eventos con flyer ·
//  promos 2×1 / Happy Hour · cierre de votación con cupón automático.
// =============================================================================
import { useMemo, useRef, useState } from "react";
import { CalendarPlus, Check, Image as ImageIcon, Martini, Monitor, Percent, Smartphone, Volume2, Power, Trash2, Trophy, X, Zap } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Shell } from "@/components/ui/Shell";
import { Badge, Btn, Empty, Field, Kpi, Modal, Panel, Segmented, inputCls, toast } from "@/components/ui/kit";
import { FotoView, ProductIcon } from "@/components/icons/ProductIcon";
import { QR } from "@/components/ui/QR";
import { useBackend, useDispatch, useNexo, useNow, useSesion } from "@/lib/store/NexoProvider";
import { cronometro, cx, fechaCorta, hhmm, money } from "@/lib/format";
import { crashActivo } from "@/lib/exchangeEngine";
import { sonido } from "@/lib/sound";
import type { Evento, Promocion } from "@/lib/types";

type Vista = "crash" | "moderacion" | "eventos" | "promos";

export default function CM() {
  return <Shell roles={["cm"]} titulo="Community Manager · promos, crash y eventos"><PanelCM /></Shell>;
}

function PanelCM() {
  const s = useNexo();
  const [vista, setVista] = useState<Vista>("crash");
  const pendientes = s.fotos.filter((f) => f.estado === "pendiente").length;
  const qr = s.pedidos.filter((p) => Date.now() - new Date(p.created_at).getTime() < 7 * 86400_000);
  const pctQr = qr.length ? Math.round((qr.filter((p) => p.tipo === "webapp_qr").length / qr.length) * 100) : 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={vista} onChange={setVista} options={[
          { value: "crash", label: "Market Crash" },
          { value: "moderacion", label: <span>Moderación {pendientes > 0 && <span className="ml-1 rounded-full bg-warn px-1.5 text-[10px] font-bold text-black">{pendientes}</span>}</span> },
          { value: "eventos", label: "Eventos" },
          { value: "promos", label: "Promos" },
        ]} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Fotos subidas" value={s.fotos.length} delta={`${pendientes} pendientes`} tono={pendientes ? "warn" : "up"} />
        <Kpi label="Votos de la noche" value={<span className="text-up">{s.fotos.reduce((a, f) => a + f.votos_count, 0)}</span>} />
        <Kpi label="Pedidos por QR" value={`${pctQr} %`} delta="últimos 7 días" />
        <Kpi label="Eventos publicados" value={s.eventos.filter((e) => e.estado === "publicado").length} />
      </div>
      {vista === "crash" && <MarketCrash />}
      {vista === "moderacion" && <Moderacion />}
      {vista === "eventos" && <Eventos />}
      {vista === "promos" && <Promos />}
    </div>
  );
}

function MarketCrash() {
  const s = useNexo();
  const now = useNow(1000);
  const dispatch = useDispatch();
  const sesion = useSesion();
  const tragos = s.productos.filter((p) => p.es_cotizable_bolsa && p.estacion === "barra");
  const [ids, setIds] = useState<string[]>(() => tragos.slice(0, 3).map((p) => p.id));
  const [modo, setModo] = useState<"minimo" | "descuento">("minimo");
  const [desc, setDesc] = useState(30);
  const [min, setMin] = useState(10);
  const [msg, setMsg] = useState("¡Se desplomó el mercado de tragos!");
  const [confirmar, setConfirmar] = useState(false);
  const activo = crashActivo(s.crash, now);
  const engagement = useMemo(() => Array.from({ length: 28 }, (_, i) => ({ d: i, v: 40 + Math.round(30 * Math.sin(i / 2.6) + (i * 7919 % 23)) })), []);

  async function lanzar() {
    setConfirmar(false);
    const e = await dispatch({ type: "marketCrash", ids, mensaje: msg, minutos: min, descuento_pct: modo === "descuento" ? desc : null, usuario: sesion?.nombre });
    if (e) return toast(e, "down");
    sonido.crash();
    toast("Market Crash lanzado en la TV, la barra y la carta QR", "down");
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <section className={cx("rounded-2xl border p-5", activo ? "border-crash bg-crash/10" : "border-crash/40 bg-gradient-to-br from-crash/10 to-transparent")}>
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-crash"><Zap size={14} />Market Crash</div>
        {activo ? (
          <div className="mt-2">
            <h2 className="text-2xl font-bold">“{s.crash!.mensaje}”</h2>
            <div className="mt-4 flex flex-wrap items-end gap-8">
              <div><div className="eyebrow">Termina en</div><div className="font-mono text-6xl font-bold tabular-nums text-crash">{cronometro(new Date(s.crash!.fin_at).getTime() - now)}</div></div>
              <div className="flex flex-wrap gap-2">{s.crash!.productos.map((id) => { const p = s.productos.find((x) => x.id === id)!; return <span key={id} className="flex items-center gap-2 rounded-xl border border-crash/40 bg-black/30 px-3 py-2 text-sm"><ProductIcon icono={p.icono} size={28} />{p.nombre} <b className="font-mono text-crash">{money(p.precio_actual)}</b></span>; })}</div>
            </div>
            <Btn variant="outline" className="mt-5" onClick={() => dispatch({ type: "finalizarCrash" })}><Power size={16} />Finalizar ahora y restaurar precios</Btn>
          </div>
        ) : (
          <>
            <h2 className="mt-1 text-2xl font-bold">Descuento masivo por tiempo limitado</h2>
            <div className="mt-4 flex flex-wrap gap-6 font-mono">
              <div><div className="eyebrow">Precio</div><div className="text-3xl">{modo === "minimo" ? "PISO" : `−${desc}%`}</div></div>
              <div><div className="eyebrow">Duración</div><div className="text-3xl">{String(min).padStart(2, "0")}:00</div></div>
              <div><div className="eyebrow">Alcance</div><div className="text-3xl">{ids.length} tragos</div></div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Field label="Modo"><select value={modo} onChange={(e) => setModo(e.target.value as "minimo" | "descuento")} className={inputCls}><option value="minimo">Caer al precio mínimo</option><option value="descuento">Descuento %</option></select></Field>
              {modo === "descuento" && <Field label="Descuento"><input type="number" min={5} max={60} value={desc} onChange={(e) => setDesc(Number(e.target.value))} className={inputCls} /></Field>}
              <Field label="Minutos"><input type="number" min={1} max={30} value={min} onChange={(e) => setMin(Number(e.target.value))} className={inputCls} /></Field>
            </div>
            <Field label="Mensaje en pantallas" className="mt-3"><input value={msg} onChange={(e) => setMsg(e.target.value)} className={inputCls} maxLength={60} /></Field>
            <div className="mt-3 flex flex-wrap gap-2">
              {tragos.map((p) => {
                const on = ids.includes(p.id);
                return <button key={p.id} onClick={() => setIds((x) => on ? x.filter((i) => i !== p.id) : [...x, p.id])} className={cx("flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm", on ? "border-crash/60 bg-crash/10 text-ink" : "border-line text-mute")}><ProductIcon icono={p.icono} size={26} />{p.nombre}<span className="font-mono text-xs">{money(modo === "minimo" ? p.precio_minimo : Math.max(p.precio_minimo, Math.round(p.precio_actual * (1 - desc / 100) / 50) * 50))}</span></button>;
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">{([[Volume2, "Alerta sonora"], [Monitor, "Pantalla NYSE"], [Smartphone, "Carta QR"], [Martini, "Barra BDS"]] as const).map(([I, t]) => <Badge key={t} tono="mute"><I size={12} />{t}</Badge>)}</div>
            <button onClick={() => setConfirmar(true)} disabled={!ids.length}
              className="mt-6 h-20 w-full rounded-2xl bg-crash text-2xl font-black tracking-tight text-black shadow-[0_20px_60px_-15px_#ff3333] transition hover:brightness-110 active:scale-[0.99] disabled:opacity-40">
              ACTIVAR MARKET CRASH
            </button>
            <p className="mt-2 text-center text-xs text-mute">Nunca perfora el precio mínimo · al terminar los precios vuelven solos · queda auditado</p>
          </>
        )}
      </section>

      <div className="flex flex-col gap-4">
        <Panel title="Happy hour programado">
          <ul className="divide-y divide-line">
            {s.promociones.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2.5 text-sm"><span>{p.titulo}</span><span className="flex items-center gap-3 font-mono text-xs text-mute">{p.hora_desde}–{p.hora_hasta}<Badge tono={p.activa ? "up" : "mute"}>{p.activa ? "Activa" : "Pausada"}</Badge></span></li>
            ))}
          </ul>
        </Panel>
        <Panel title="Engagement · últimos 28 días">
          <div className="h-36">
            <ResponsiveContainer><AreaChart data={engagement}><defs><linearGradient id="eng" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1ee08f" stopOpacity={0.35} /><stop offset="100%" stopColor="#1ee08f" stopOpacity={0} /></linearGradient></defs><XAxis dataKey="d" hide /><Tooltip contentStyle={{ background: "#0c1117", border: "1px solid #1e2a36", borderRadius: 12 }} labelFormatter={(d) => `Día ${Number(d) + 1}`} formatter={(v) => [v, "interacciones"]} /><Area dataKey="v" stroke="#1ee08f" strokeWidth={2} fill="url(#eng)" /></AreaChart></ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Historial de crashes">
          <ul className="space-y-1 text-sm">
            {s.crashes.slice(0, 5).map((c) => <li key={c.id} className="flex justify-between"><span className="truncate">“{c.mensaje}”</span><span className="font-mono text-xs text-mute">{fechaCorta(c.inicio_at)} {hhmm(c.inicio_at)}</span></li>)}
            {!s.crashes.length && <li className="text-mute">Todavía no se lanzó ninguno.</li>}
          </ul>
        </Panel>
      </div>

      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="¿Lanzar el Market Crash?" footer={<div className="flex justify-end gap-2"><Btn onClick={() => setConfirmar(false)}>Cancelar</Btn><Btn variant="danger" onClick={lanzar}><Zap size={16} />Lanzar ahora</Btn></div>}>
        <p className="text-sm text-mute">{ids.length} tragos {modo === "minimo" ? "caen a su precio mínimo" : `bajan ${desc} %`} durante {min} minutos. Suena la alerta en la TV del salón, la barra recibe la prioridad y los clientes lo ven en la carta.</p>
      </Modal>
    </div>
  );
}

function Moderacion() {
  const s = useNexo();
  const backend = useBackend();
  const dispatch = useDispatch();
  const sesion = useSesion();
  const [resultado, setResultado] = useState<null | { codigo: string; mesa: number | null; votos: number; url: string }>(null);
  const [confirmar, setConfirmar] = useState(false);
  const pend = s.fotos.filter((f) => f.estado === "pendiente");
  const aprob = s.fotos.filter((f) => f.estado === "aprobada").sort((a, b) => b.votos_count - a.votos_count);
  const filtro = { ok: { t: "Auto OK", tono: "up" }, revisar: { t: "Revisar", tono: "down" }, pendiente: { t: "Pendiente", tono: "warn" } } as const;

  async function cerrar() {
    setConfirmar(false);
    const cand = aprob.filter((f) => !f.es_ganadora)[0];
    const e = await dispatch({ type: "cerrarVotacion", descuento_pct: 20, usuario: sesion?.nombre });
    if (e) return toast(e, "warn");
    sonido.listo();
    // leemos el cupón emitido para mostrarlo
    const f = backend.getState()?.fotos.find((x) => x.id === cand?.id);
    setResultado({ codigo: f?.cupon_codigo ?? "—", mesa: cand?.mesa_numero ?? null, votos: cand?.votos_count ?? 0, url: cand?.url_foto ?? "" });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
      <Panel title={`Moderación de fotos · ${pend.length} pendientes`}>
        {!pend.length && <Empty icon={<ImageIcon size={30} />} title="Nada para moderar" hint="Las fotos que suben los clientes aparecen acá. Ninguna sale en pantalla sin tu aprobación." />}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {pend.map((f) => (
            <div key={f.id} className="overflow-hidden rounded-2xl border border-line bg-bg">
              <FotoView url={f.url_foto} size="full" className="rounded-none" />
              <div className="p-3">
                <div className="flex items-center justify-between text-xs"><span>Mesa {String(f.mesa_numero ?? "—").padStart(2, "0")}</span><Badge tono={filtro[f.filtro_auto].tono}>{filtro[f.filtro_auto].t}</Badge></div>
                {f.descripcion && <p className="mt-1 line-clamp-2 text-xs text-mute">{f.descripcion}</p>}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Btn size="sm" variant="primary" onClick={() => dispatch({ type: "moderarFoto", foto_id: f.id, estado: "aprobada" })}><Check size={14} />Aprobar</Btn>
                  <Btn size="sm" onClick={() => dispatch({ type: "moderarFoto", foto_id: f.id, estado: "rechazada" })}><X size={14} />Rechazar</Btn>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-mute">Regla: no se publican fotos con rostros de menores. El filtro automático marca “Revisar” cuando no puede validar la imagen.</p>
      </Panel>
      <div className="flex flex-col gap-4">
        <Panel title="Ranking en vivo" action={<Badge tono="down" dot>En vivo</Badge>}>
          <ol className="space-y-2">
            {aprob.slice(0, 6).map((f, i) => (
              <li key={f.id} className="flex items-center gap-3">
                <span className="w-5 font-mono text-mute">#{i + 1}</span>
                <FotoView url={f.url_foto} size={40} className="rounded-lg" />
                <span className="flex-1 text-sm">Mesa {f.mesa_numero}{f.es_ganadora && <Trophy size={13} className="ml-1 inline text-up" />}</span>
                <span className="font-mono text-up">{f.votos_count}</span>
                <button onClick={() => dispatch({ type: "moderarFoto", foto_id: f.id, estado: "rechazada" })} className="text-dim hover:text-down" title="Retirar de pantalla"><X size={14} /></button>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel>
          <div className="flex items-center gap-2 font-semibold"><Trophy className="text-up" size={18} />Cerrar votación de la noche</div>
          <p className="mt-1 text-sm text-mute">Elige automáticamente la foto más votada y le genera un cupón del 20 % de uso único (vence en 30 días). El cliente lo ve en su celular con código QR.</p>
          <Btn variant="primary" size="lg" className="mt-3 w-full" onClick={() => setConfirmar(true)} disabled={!aprob.some((f) => !f.es_ganadora)}>Cerrar votación y premiar</Btn>
        </Panel>
      </div>
      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="¿Cerrar la votación?" footer={<div className="flex justify-end gap-2"><Btn onClick={() => setConfirmar(false)}>Cancelar</Btn><Btn variant="primary" onClick={cerrar}>Cerrar y emitir cupón</Btn></div>}>
        <p className="text-sm text-mute">Se premia a la foto con más votos y se reinicia la ronda (todos pueden volver a votar).</p>
      </Modal>
      <Modal open={!!resultado} onClose={() => setResultado(null)} title={<span className="flex items-center gap-2"><Trophy size={18} className="text-up" />Foto ganadora</span>}>
        {resultado && (
          <div className="flex flex-col items-center gap-3 text-center">
            <FotoView url={resultado.url} size={160} className="rounded-2xl" />
            <div>Mesa {resultado.mesa} · {resultado.votos} votos</div>
            <div className="rounded-2xl bg-white p-3"><QR value={resultado.codigo} size={130} /></div>
            <div className="font-mono text-2xl font-bold tracking-widest text-up">{resultado.codigo}</div>
            <p className="text-xs text-mute">El cupón ya aparece en el celular del cliente y la TV muestra la foto ganadora.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

async function aDataUrl(file: File) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1080 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.75);
}

function Eventos() {
  const s = useNexo();
  const dispatch = useDispatch();
  const file = useRef<HTMLInputElement>(null);
  const vacio = { titulo: "", subtitulo: "", descripcion: "", fecha: "", flyer_url: null as string | null, estado: "publicado" as Evento["estado"] };
  const [f, setF] = useState(vacio);
  const tono = { publicado: "up", programado: "warn", borrador: "mute" } as const;
  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Panel title="Cartelera de eventos">
        <table className="w-full text-sm">
          <thead><tr className="eyebrow text-left"><th className="py-2">Evento</th><th>Fecha</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {s.eventos.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="py-2.5"><div className="font-semibold">{e.titulo}</div><div className="text-xs text-mute">{e.subtitulo}</div></td>
                <td className="font-mono text-xs">{fechaCorta(e.fecha)} {hhmm(e.fecha)}</td>
                <td><Badge tono={tono[e.estado]}>{e.estado}</Badge></td>
                <td className="text-right"><button onClick={() => dispatch({ type: "borrarEvento", id: e.id })} className="text-dim hover:text-down" aria-label="Borrar"><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Panel title="Nuevo evento">
        <div className="space-y-3">
          <Field label="Título"><input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} className={inputCls} placeholder="DJ Nahuel" /></Field>
          <Field label="Subtítulo"><input value={f.subtitulo} onChange={(e) => setF({ ...f, subtitulo: e.target.value })} className={inputCls} placeholder="Deep house" /></Field>
          <Field label="Fecha y hora"><input type="datetime-local" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} className={inputCls} /></Field>
          <Field label="Descripción"><textarea value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className={cx(inputCls, "h-20 py-2")} /></Field>
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={async (e) => { const x = e.target.files?.[0]; if (x) setF({ ...f, flyer_url: await aDataUrl(x) }); }} />
          <div className="flex items-center gap-3">
            <Btn onClick={() => file.current?.click()}><ImageIcon size={16} />{f.flyer_url ? "Cambiar flyer" : "Subir flyer"}</Btn>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {f.flyer_url && <img src={f.flyer_url} alt="Flyer" className="h-12 w-20 rounded-lg object-cover" />}
            <select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as Evento["estado"] })} className={cx(inputCls, "w-36")}><option value="publicado">Publicado</option><option value="programado">Programado</option><option value="borrador">Borrador</option></select>
          </div>
          <Btn variant="primary" size="lg" className="w-full" onClick={async () => {
            if (!f.titulo || !f.fecha) return toast("Título y fecha son obligatorios", "warn");
            await dispatch({ type: "guardarEvento", evento: { ...f, fecha: new Date(f.fecha).toISOString() } });
            toast("Evento guardado · visible en TV y carta"); setF(vacio);
          }}><CalendarPlus size={18} />Publicar evento</Btn>
        </div>
      </Panel>
    </div>
  );
}

function Promos() {
  const s = useNexo();
  const dispatch = useDispatch();
  const [p, setP] = useState<Omit<Promocion, "id">>({ titulo: "", tipo: "happy_hour", descuento_pct: 20, categoria_id: s.categorias[0]?.id ?? null, dias: [1, 2, 3, 4], hora_desde: "19:00", hora_hasta: "21:00", activa: true });
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <Panel title="Promociones">
        <ul className="divide-y divide-line">
          {s.promociones.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-3 py-3">
              <div><div className="font-semibold">{x.titulo}</div><div className="text-xs text-mute">{x.dias.map((d) => dias[d]).join(" · ")} · {x.hora_desde}–{x.hora_hasta} · {s.categorias.find((c) => c.id === x.categoria_id)?.nombre}</div></div>
              <Btn size="sm" variant={x.activa ? "primary" : "ghost"} onClick={() => dispatch({ type: "togglePromo", id: x.id })}>{x.activa ? "Activa" : "Pausada"}</Btn>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-mute">Las promos tienen vigencia y no pueden pisar el piso de margen del motor Exchange.</p>
      </Panel>
      <Panel title="Nueva promo">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {([["happy_hour", "Happy Hour"], ["2x1", "2×1"], ["descuento", "Descuento"], ["combo", "Combo"]] as const).map(([k, t]) => (
              <button key={k} onClick={() => setP({ ...p, tipo: k, descuento_pct: k === "2x1" ? 50 : p.descuento_pct })} className={cx("h-11 rounded-xl border text-sm", p.tipo === k ? "border-up bg-up/10 text-up" : "border-line")}>{t}</button>
            ))}
          </div>
          <Field label="Título"><input value={p.titulo} onChange={(e) => setP({ ...p, titulo: e.target.value })} className={inputCls} placeholder="Happy Hour · Tragos −20 %" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Categoría"><select value={p.categoria_id ?? ""} onChange={(e) => setP({ ...p, categoria_id: e.target.value })} className={inputCls}>{s.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></Field>
            <Field label="Descuento %"><input type="number" value={p.descuento_pct ?? 0} onChange={(e) => setP({ ...p, descuento_pct: Number(e.target.value) })} className={inputCls} /></Field>
            <Field label="Desde"><input type="time" value={p.hora_desde ?? ""} onChange={(e) => setP({ ...p, hora_desde: e.target.value })} className={inputCls} /></Field>
            <Field label="Hasta"><input type="time" value={p.hora_hasta ?? ""} onChange={(e) => setP({ ...p, hora_hasta: e.target.value })} className={inputCls} /></Field>
          </div>
          <div className="flex gap-1">{dias.map((d, i) => <button key={d} onClick={() => setP({ ...p, dias: p.dias.includes(i) ? p.dias.filter((x) => x !== i) : [...p.dias, i] })} className={cx("h-9 flex-1 rounded-lg border text-xs", p.dias.includes(i) ? "border-up text-up" : "border-line text-mute")}>{d}</button>)}</div>
          <Btn variant="primary" size="lg" className="w-full" onClick={async () => { if (!p.titulo) return toast("Poné un título", "warn"); await dispatch({ type: "guardarPromo", promo: p }); toast("Promo activada"); setP({ ...p, titulo: "" }); }}><Percent size={16} />Activar promo</Btn>
        </div>
      </Panel>
    </div>
  );
}
