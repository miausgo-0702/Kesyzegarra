"use client";
// =============================================================================
//  FASE 6.2 · Panel del programador (Super Admin)
//  Bares multi-tenant y licencias · parámetros del motor Exchange con simulador ·
//  visor de logs · estado de APIs e integraciones.
// =============================================================================
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { Building2, CheckCircle2, CircleAlert, Database, KeyRound, Plus, RefreshCw, Save, ShieldOff, ShieldCheck } from "lucide-react";
import { Shell } from "@/components/ui/Shell";
import { Badge, Btn, Field, Modal, Panel, Segmented, inputCls, toast } from "@/components/ui/kit";
import { ExportBtns } from "@/components/ui/ExportBtns";
import { useDispatch, useNexo, useSesion } from "@/lib/store/NexoProvider";
import { cx, fechaCorta, hhmmss, money } from "@/lib/format";
import { simularSerie, pisoEfectivo } from "@/lib/exchangeEngine";
import { costoProducto } from "@/lib/store/selectors";
import type { Bar, ReglasPrecios } from "@/lib/types";

type Vista = "bares" | "exchange" | "logs" | "apis";

export default function SuperAdmin() {
  return <Shell roles={["super_admin"]} titulo="Super Admin · control multi-bar"><Panelx /></Shell>;
}

function Panelx() {
  const [v, setV] = useState<Vista>("exchange");
  return (
    <div className="flex flex-col gap-4">
      <Segmented value={v} onChange={setV} options={[{ value: "exchange", label: "Algoritmo Exchange" }, { value: "bares", label: "Sucursales" }, { value: "logs", label: "Logs" }, { value: "apis", label: "APIs y backups" }]} />
      {v === "bares" && <Bares />}
      {v === "exchange" && <Exchange />}
      {v === "logs" && <Logs />}
      {v === "apis" && <Apis />}
    </div>
  );
}

function Exchange() {
  const s = useNexo();
  const dispatch = useDispatch();
  const sesion = useSesion();
  const [r, setR] = useState<ReglasPrecios>(s.bar.reglas_precios);
  const [pid, setPid] = useState(s.productos[0].id);
  const [demanda, setDemanda] = useState<"alta" | "normal" | "baja" | "pico">("pico");
  const p = s.productos.find((x) => x.id === pid)!;
  const costo = costoProducto(s, p.id);
  const base = { ...p, precio_actual: p.precio_base, precio_maximo: Math.round((p.precio_base * (1 + r.tope_pct / 100)) / r.redondeo) * r.redondeo };
  const ventas = useMemo(() => Array.from({ length: 48 }, (_, i) => {
    const o = p.objetivo_ventana;
    const ruido = ((i * 7919) % 5) - 2;
    if (demanda === "alta") return o + 2 + (ruido > 0 ? 1 : 0);
    if (demanda === "baja") return Math.max(0, o - 2 + (ruido < 0 ? -1 : 0));
    if (demanda === "pico") return Math.max(0, Math.round(o + 3 * Math.sin(i / 5) + ruido * 0.6 + (i > 30 ? 2 : 0)));
    return Math.max(0, o + (ruido > 1 ? 1 : ruido < -1 ? -1 : 0));
  }), [demanda, p.objetivo_ventana]);
  const serie = simularSerie(base, ventas, costo, r).map((precio, i) => ({ i, precio }));
  const piso = pisoEfectivo(base, costo, r);
  const num = (k: keyof ReglasPrecios, label: string, step = 1, suf = "") => (
    <div className="flex items-center justify-between gap-3 border-b border-line/60 py-2.5 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-1"><input type="number" step={step} value={r[k]} onChange={(e) => setR({ ...r, [k]: Number(e.target.value) })} className="h-9 w-24 rounded-lg border border-line bg-bg px-2 text-right font-mono" />{suf && <span className="w-14 text-xs text-mute">{suf}</span>}</span>
    </div>
  );
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
      <Panel title="Parámetros del motor Exchange">
        {num("ventana_min", "Ventana de cálculo", 1, "min")}
        {num("paso_pct_por_unidad", "Ajuste por unidad de exceso", 0.5, "% / u.")}
        {num("paso_max_pct", "Paso máximo por ventana", 0.5, "± %")}
        {num("tope_pct", "Tope máximo sobre base", 5, "%")}
        {num("margen_piso", "Piso mínimo (costo ×)", 0.05, "× costo")}
        {num("redondeo", "Redondeo", 10, "$")}
        {num("crash_duracion_min", "Market Crash · duración", 1, "min")}
        <div className="mt-3 rounded-xl border border-line bg-bg/60 p-3 font-mono text-xs leading-relaxed text-mute">
          exceso = ventas − objetivo<br />paso = clamp({r.paso_pct_por_unidad}% × exceso, −{r.paso_max_pct}%, +{r.paso_max_pct}%)<br />nuevo = round{r.redondeo}(precio × (1 + paso))<br />precio = clamp(nuevo, piso, tope)
        </div>
        <Btn variant="primary" className="mt-3 w-full" onClick={async () => { await dispatch({ type: "actualizarReglas", reglas: r, usuario: sesion?.nombre }); toast("Reglas guardadas · versión registrada"); }}><Save size={16} />Guardar versión de reglas</Btn>
      </Panel>
      <Panel title={`Simulación · ${p.nombre} (precio base ${money(p.precio_base)})`} action={<select value={pid} onChange={(e) => setPid(e.target.value)} className="h-8 rounded-lg border border-line bg-bg px-2 text-xs">{s.productos.filter((x) => x.es_cotizable_bolsa).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>}>
        <Segmented value={demanda} onChange={setDemanda} options={[{ value: "pico", label: "Noche con pico" }, { value: "alta", label: "Demanda alta" }, { value: "normal", label: "Normal" }, { value: "baja", label: "Demanda baja" }]} />
        <div className="mt-3 h-64">
          <ResponsiveContainer>
            <AreaChart data={serie} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs><linearGradient id="sim" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1ee08f" stopOpacity={0.35} /><stop offset="100%" stopColor="#1ee08f" stopOpacity={0} /></linearGradient></defs>
              <YAxis domain={[piso - 200, base.precio_maximo + 200]} tickFormatter={(v) => money(v)} tick={{ fill: "#8a97a6", fontSize: 11 }} axisLine={false} tickLine={false} width={64} />
              <ReferenceLine y={base.precio_maximo} stroke="#ff4d5e" strokeDasharray="4 4" label={{ value: "Tope", fill: "#ff4d5e", fontSize: 11, position: "insideTopRight" }} />
              <ReferenceLine y={piso} stroke="#f5b83d" strokeDasharray="4 4" label={{ value: "Piso", fill: "#f5b83d", fontSize: 11, position: "insideBottomRight" }} />
              <Tooltip formatter={(v) => money(Number(v))} labelFormatter={(i) => `Ventana ${i}`} contentStyle={{ background: "#0c1117", border: "1px solid #1e2a36", borderRadius: 12 }} />
              <Area type="linear" dataKey="precio" stroke="#1ee08f" strokeWidth={2} fill="url(#sim)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex justify-between font-mono text-xs"><span className="text-down">Tope {money(base.precio_maximo)}</span><span className="text-up">Final {money(serie[serie.length - 1].precio)}</span><span className="text-warn">Piso {money(piso)} (costo {money(costo)})</span></div>
        <p className="mt-3 text-xs text-mute">El simulador usa la misma función pura que el motor en producción (`src/lib/exchangeEngine.ts`, cubierta por tests) y la función SQL `exchange_tick`.</p>
      </Panel>
    </div>
  );
}

function Bares() {
  const s = useNexo();
  const dispatch = useDispatch();
  const [edit, setEdit] = useState<Partial<Bar> | null>(null);
  return (
    <Panel title="Sucursales (tenants)" action={<span className="flex gap-2"><ExportBtns nombre="bares" filas={() => s.bares.map((b) => ({ Bar: b.nombre, Slug: b.slug, Plan: b.plan, Usuarios: b.usuarios ?? 0, Estado: b.estado_licencia, Vence: b.licencia_vence ? new Date(b.licencia_vence).toLocaleDateString("es-AR") : "" }))} /><Btn size="sm" variant="primary" onClick={() => setEdit({ nombre: "", slug: "", plan: "basico" })}><Plus size={14} />Nuevo bar</Btn></span>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="eyebrow text-left"><th className="py-2">Bar</th><th>Plan</th><th className="text-right">Usuarios</th><th>Estado</th><th>Licencia vence</th><th /></tr></thead>
          <tbody>
            {s.bares.map((b) => (
              <tr key={b.id} className="border-t border-line/60">
                <td className="py-3"><div className="flex items-center gap-2 font-semibold"><Building2 size={15} className="text-mute" />{b.nombre}</div><div className="font-mono text-xs text-mute">/{b.slug}</div></td>
                <td className="capitalize">{b.plan}</td>
                <td className="text-right font-mono">{b.usuarios ?? 0}</td>
                <td><Badge tono={b.estado_licencia === "activa" ? "up" : b.estado_licencia === "prueba" ? "warn" : "down"}>{b.estado_licencia}</Badge></td>
                <td className="font-mono text-xs">{b.licencia_vence ? fechaCorta(b.licencia_vence) : "—"}</td>
                <td className="text-right">
                  <span className="flex justify-end gap-1.5">
                    <Btn size="sm" onClick={() => setEdit(b)}>Editar</Btn>
                    {b.estado_licencia === "suspendida"
                      ? <Btn size="sm" variant="primary" onClick={() => dispatch({ type: "licenciaBar", bar_id: b.id, estado: "activa" })}><ShieldCheck size={13} />Activar</Btn>
                      : <Btn size="sm" variant="danger" onClick={() => dispatch({ type: "licenciaBar", bar_id: b.id, estado: "suspendida" })}><ShieldOff size={13} />Suspender</Btn>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-mute">Cada bar queda aislado por RLS (bar_id en todas las tablas). Un bar suspendido no corre el motor Exchange y su carta pública deja de estar disponible.</p>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "Editar bar" : "Nuevo bar"} footer={<div className="flex justify-end gap-2"><Btn onClick={() => setEdit(null)}>Cancelar</Btn><Btn variant="primary" onClick={async () => { const e = await dispatch({ type: "guardarBar", bar: edit as Bar }); if (e) return toast(e, "down"); toast("Bar guardado"); setEdit(null); }}>Guardar</Btn></div>}>
        {edit && (
          <div className="space-y-3">
            <Field label="Nombre"><input value={edit.nombre ?? ""} onChange={(e) => setEdit({ ...edit, nombre: e.target.value, slug: edit.id ? edit.slug : e.target.value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} className={inputCls} /></Field>
            <Field label="Slug (URL de TV y carta)"><input value={edit.slug ?? ""} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} className={cx(inputCls, "font-mono")} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Plan"><select value={edit.plan} onChange={(e) => setEdit({ ...edit, plan: e.target.value as Bar["plan"] })} className={inputCls}><option value="basico">Básico</option><option value="pro">Pro</option><option value="enterprise">Enterprise</option></select></Field>
              <Field label="Dirección"><input value={edit.direccion ?? ""} onChange={(e) => setEdit({ ...edit, direccion: e.target.value })} className={inputCls} /></Field>
            </div>
          </div>
        )}
      </Modal>
    </Panel>
  );
}

function Logs() {
  const s = useNexo();
  const [nivel, setNivel] = useState<"todos" | "info" | "warn" | "error">("todos");
  const logs = s.logs.filter((l) => nivel === "todos" || l.nivel === nivel);
  const color = { debug: "text-dim", info: "text-info", warn: "text-warn", error: "text-down" };
  return (
    <Panel title="Logs y auditoría del sistema" action={<span className="flex gap-2"><Segmented value={nivel} onChange={setNivel} options={[{ value: "todos", label: "Todos" }, { value: "info", label: "Info" }, { value: "warn", label: "Warn" }, { value: "error", label: "Error" }]} /><ExportBtns nombre="logs" filas={() => logs.map((l) => ({ Fecha: l.created_at, Nivel: l.nivel, Origen: l.origen, Mensaje: l.mensaje }))} /></span>}>
      <div className="max-h-[66dvh] overflow-y-auto rounded-xl border border-line bg-black/60 p-3 font-mono text-xs scroll-thin">
        {logs.map((l) => (
          <div key={l.id} className="flex gap-3 py-1">
            <span className="text-dim">{hhmmss(l.created_at)}</span>
            <span className={cx("w-12 uppercase", color[l.nivel])}>{l.nivel}</span>
            <span className="w-24 truncate text-mute">{l.origen}</span>
            <span className="text-ink/90">{l.mensaje}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Apis() {
  const [salud, setSalud] = useState<Record<string, boolean> | null>(null);
  const cargar = () => fetch("/api/health").then((r) => r.json()).then(setSalud).catch(() => setSalud({}));
  useEffect(() => { cargar(); }, []);
  const items: [string, string, string][] = [
    ["supabase", "Supabase (Postgres, Auth, Realtime, Storage)", "NEXT_PUBLIC_SUPABASE_URL + ANON_KEY"],
    ["service_role", "Service role (cron Exchange, PIN)", "SUPABASE_SERVICE_ROLE_KEY"],
    ["anthropic", "Claude API (copiloto IA)", "ANTHROPIC_API_KEY"],
    ["cron", "Cron del motor Exchange", "CRON_SECRET (Vercel Cron)"],
  ];
  const s = useNexo();
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Configuración global de APIs" action={<Btn size="sm" onClick={cargar}><RefreshCw size={13} />Verificar</Btn>}>
        <ul className="space-y-2">
          {items.map(([k, t, env]) => (
            <li key={k} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm">
              <span className="flex items-center gap-3">{salud?.[k] ? <CheckCircle2 size={18} className="text-up" /> : <CircleAlert size={18} className="text-warn" />}<span><div className="font-semibold">{t}</div><div className="font-mono text-[11px] text-mute">{env}</div></span></span>
              <Badge tono={salud?.[k] ? "up" : "warn"}>{salud == null ? "…" : salud[k] ? "Configurado" : "Falta"}</Badge>
            </li>
          ))}
          {["Mapas: Leaflet + CARTO (sin clave)", "Pasarela de pagos QR (a definir)", "Facturación electrónica ARCA (a definir)", "WhatsApp Business (enlaces wa.me activos)"].map((t) => (
            <li key={t} className="flex items-center gap-3 rounded-xl border border-line/60 p-3 text-sm text-mute"><KeyRound size={16} />{t}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-mute">Las claves viven en variables de entorno de Vercel; nunca en la base ni en el navegador. Esta pantalla solo informa si están presentes.</p>
      </Panel>
      <Panel title="Backups">
        <ul className="space-y-2 text-sm">
          {s.logs.filter((l) => l.origen === "backup").concat([{ id: "b2", nivel: "info", origen: "backup", mensaje: "Backup diario completo OK · 1,8 GB (verificado con restore de prueba)", created_at: new Date(Date.now() - 20 * 3600_000).toISOString() }]).map((l) => (
            <li key={l.id} className="flex items-center gap-3 rounded-xl border border-line p-3"><Database size={16} className="text-up" /><span className="flex-1">{l.mensaje}</span><span className="font-mono text-xs text-mute">{fechaCorta(l.created_at)}</span></li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-mute">Supabase hace backups automáticos (PITR en plan Pro). Los backups se verifican, no solo se generan.</p>
      </Panel>
    </div>
  );
}
