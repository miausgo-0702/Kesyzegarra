"use client";
// Datos del bar y reglas de precios dinámicos.
import { useEffect, useState } from "react";
import { Check, LocateFixed } from "lucide-react";
import { Shell } from "@/components/ui/Shell";
import { Btn, Field, Panel, inputCls, toast } from "@/components/ui/kit";
import { useDispatch, useNexo, useSesion } from "@/lib/store/NexoProvider";
import { cx } from "@/lib/format";
import type { ReglasPrecios } from "@/lib/types";

export default function MiBar() {
  return <Shell roles={[]} titulo="Mi bar"><Ajustes /></Shell>;
}

function Ajustes() {
  const s = useNexo();
  const dispatch = useDispatch();
  const sesion = useSesion();
  const [d, setD] = useState({ nombre: s.bar.nombre, direccion: s.bar.direccion, propina_sugerida_pct: s.bar.propina_sugerida_pct, lat: s.bar.lat, lng: s.bar.lng });
  const [r, setR] = useState<ReglasPrecios>(s.bar.reglas_precios);
  useEffect(() => { setD({ nombre: s.bar.nombre, direccion: s.bar.direccion, propina_sugerida_pct: s.bar.propina_sugerida_pct, lat: s.bar.lat, lng: s.bar.lng }); setR(s.bar.reglas_precios); }, [s.bar.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const num = (k: keyof ReglasPrecios, label: string, ayuda: string, step = 1) => (
    <div className="flex items-center justify-between gap-4 border-b border-line/60 py-3">
      <div><div className="text-sm font-medium">{label}</div><div className="text-xs text-mute">{ayuda}</div></div>
      <input type="number" step={step} value={r[k]} onChange={(e) => setR({ ...r, [k]: Number(e.target.value) })} className={cx(inputCls, "h-10 w-24 text-right font-mono")} aria-label={label} />
    </div>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Datos del bar">
        <div className="space-y-4">
          <Field label="Nombre"><input id="bar-nombre" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} className={inputCls} /></Field>
          <Field label="Dirección (punto de partida del delivery)" grupo>
            <div className="flex gap-2">
              <input id="bar-dir" value={d.direccion} onChange={(e) => setD({ ...d, direccion: e.target.value })} className={inputCls} />
              <Btn type="button" onClick={() => navigator.geolocation?.getCurrentPosition((p) => { setD({ ...d, lat: p.coords.latitude, lng: p.coords.longitude }); toast("Ubicación del bar tomada del dispositivo"); }, () => toast("No pudimos obtener la ubicación", "warn"))} aria-label="Usar mi ubicación"><LocateFixed size={16} /></Btn>
            </div>
          </Field>
          <Field label="Propina sugerida en la cuenta (%)"><input id="bar-propina" type="number" min={0} max={30} value={d.propina_sugerida_pct} onChange={(e) => setD({ ...d, propina_sugerida_pct: Number(e.target.value) })} className={cx(inputCls, "w-32 font-mono")} /></Field>
          <Btn variant="primary" onClick={async () => { const e = await dispatch({ type: "configurarBar", datos: d }); toast(e ?? "Datos guardados", e ? "down" : "up"); }}><Check size={16} />Guardar datos</Btn>
        </div>
      </Panel>
      <Panel title="Precios dinámicos">
        {num("ventana_min", "Ventana de cálculo (min)", "Cada cuánto se recalculan los precios")}
        {num("paso_pct_por_unidad", "Ajuste por unidad (%)", "Cuánto sube o baja por cada venta sobre o bajo lo esperado", 0.5)}
        {num("paso_max_pct", "Ajuste máximo por ventana (%)", "Límite de cambio en cada recálculo", 0.5)}
        {num("tope_pct", "Tope sobre el precio base (%)", "Precio máximo de los productos nuevos")}
        {num("margen_piso", "Piso: costo ×", "El precio nunca baja de costo de receta por este factor", 0.05)}
        {num("redondeo", "Redondeo ($)", "Los precios terminan en múltiplos de este valor", 10)}
        {num("crash_duracion_min", "Duración del Market Crash (min)", "Tiempo por defecto de cada crash")}
        <Btn variant="primary" className="mt-4" onClick={async () => { await dispatch({ type: "actualizarReglas", reglas: r, usuario: sesion?.nombre }); toast("Reglas de precios guardadas"); }}><Check size={16} />Guardar reglas</Btn>
      </Panel>
    </div>
  );
}
