// =============================================================================
//  MOTOR EXCHANGE — precios dinámicos tipo bolsa (función pura, testeable)
//  La misma regla vive en SQL (exchange_tick) para producción con pg_cron.
//
//   exceso = vendidos − objetivo
//   paso   = clamp(paso_pct_por_unidad% × exceso, −paso_max%, +paso_max%)
//   nuevo  = redondear_a_50(precio × (1 + paso))
//   precio = clamp(nuevo, piso, tope)
//   piso   = max(precio_minimo, costo_receta × margen_piso)   ← nunca vende a pérdida
//   tope   = precio_maximo                                    ← nunca supera el máximo
// =============================================================================
import type { MarketCrash, Producto, ReglasPrecios } from "./types";

export const REGLAS_DEFAULT: ReglasPrecios = {
  ventana_min: 15,
  objetivo_default: 6,
  paso_pct_por_unidad: 1,
  paso_max_pct: 3,
  redondeo: 50,
  margen_piso: 1.35,
  tope_pct: 40,
  crash_duracion_min: 10,
};

export interface VentaRegistro {
  producto_id: string;
  cantidad: number;
  ts: number; // epoch ms
}

export interface CambioPrecio {
  producto_id: string;
  precio_anterior: number;
  precio_nuevo: number;
  vendidos: number;
  paso_pct: number;
  motivo: "demanda_alta" | "demanda_baja" | "objetivo" | "tope" | "piso";
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
export const redondear = (v: number, paso = 50) => Math.round(v / paso) * paso;

/** Piso efectivo: el mayor entre el precio mínimo cargado y costo × margen. */
export function pisoEfectivo(p: Pick<Producto, "precio_minimo">, costo: number, reglas: ReglasPrecios = REGLAS_DEFAULT): number {
  const pisoCosto = Math.ceil((costo * reglas.margen_piso) / reglas.redondeo) * reglas.redondeo;
  return Math.max(p.precio_minimo, pisoCosto);
}

/** Calcula el nuevo precio de UN producto dada la cantidad vendida en la ventana. */
export function calcularPrecio(
  p: Pick<Producto, "precio_actual" | "precio_minimo" | "precio_maximo" | "objetivo_ventana">,
  vendidos: number,
  costo: number,
  reglas: ReglasPrecios = REGLAS_DEFAULT,
): { precio: number; paso_pct: number; motivo: CambioPrecio["motivo"] } {
  const exceso = vendidos - p.objetivo_ventana;
  const paso = clamp(reglas.paso_pct_por_unidad * exceso, -reglas.paso_max_pct, reglas.paso_max_pct) / 100;
  const piso = pisoEfectivo(p, costo, reglas);
  const tope = Math.max(p.precio_maximo, piso);
  const bruto = redondear(p.precio_actual * (1 + paso), reglas.redondeo);
  const precio = clamp(bruto, piso, tope);
  const motivo: CambioPrecio["motivo"] =
    precio === tope && bruto >= tope && paso > 0 ? "tope"
    : precio === piso && bruto <= piso && paso < 0 ? "piso"
    : paso > 0 ? "demanda_alta" : paso < 0 ? "demanda_baja" : "objetivo";
  return { precio, paso_pct: Math.round(paso * 1000) / 10, motivo };
}

/** Suma unidades vendidas por producto dentro de la ventana [ahora − ventana, ahora]. */
export function ventasEnVentana(ventas: VentaRegistro[], ahora: number, ventanaMs: number): Map<string, number> {
  const desde = ahora - ventanaMs;
  const m = new Map<string, number>();
  for (const v of ventas) {
    if (v.ts > desde && v.ts <= ahora) m.set(v.producto_id, (m.get(v.producto_id) ?? 0) + v.cantidad);
  }
  return m;
}

/**
 * Evalúa todo el mercado. Devuelve SOLO los cambios (y el detalle de vendidos).
 * Los productos no cotizables o afectados por un Market Crash activo no se tocan.
 */
export function evaluarMercado(args: {
  productos: Producto[];
  ventas: VentaRegistro[];
  costos: Record<string, number>;
  reglas?: ReglasPrecios;
  ahora?: number;
  ventanaMs?: number;
  crash?: MarketCrash | null;
}): CambioPrecio[] {
  const reglas = args.reglas ?? REGLAS_DEFAULT;
  const ahora = args.ahora ?? Date.now();
  const ventanaMs = args.ventanaMs ?? reglas.ventana_min * 60_000;
  const vendidos = ventasEnVentana(args.ventas, ahora, ventanaMs);
  const bloqueados = new Set(crashActivo(args.crash, ahora) ? args.crash!.productos : []);

  const cambios: CambioPrecio[] = [];
  for (const p of args.productos) {
    if (!p.activo || !p.es_cotizable_bolsa || bloqueados.has(p.id)) continue;
    const v = vendidos.get(p.id) ?? 0;
    const r = calcularPrecio(p, v, args.costos[p.id] ?? 0, reglas);
    cambios.push({ producto_id: p.id, precio_anterior: p.precio_actual, precio_nuevo: r.precio, vendidos: v, paso_pct: r.paso_pct, motivo: r.motivo });
  }
  return cambios;
}

export function crashActivo(crash: MarketCrash | null | undefined, ahora = Date.now()): boolean {
  return !!crash && !crash.finalizado && new Date(crash.fin_at).getTime() > ahora;
}

/**
 * MARKET CRASH: durante `minutos` los productos seleccionados caen a su
 * precio_minimo (o −descuento_pct, sin perforar el mínimo). Guarda los precios
 * previos para restaurarlos automáticamente al terminar.
 */
export function triggerMarketCrash(args: {
  productos: Producto[];
  ids: string[];
  mensaje?: string;
  minutos?: number;
  descuento_pct?: number | null;
  usuario_id?: string | null;
  ahora?: number;
  reglas?: ReglasPrecios;
  id?: string;
}): { crash: MarketCrash; precios: Record<string, number> } {
  const ahora = args.ahora ?? Date.now();
  const reglas = args.reglas ?? REGLAS_DEFAULT;
  const minutos = args.minutos ?? reglas.crash_duracion_min;
  const sel = args.productos.filter((p) => args.ids.includes(p.id) && p.es_cotizable_bolsa);
  const previos: Record<string, number> = {};
  const precios: Record<string, number> = {};
  for (const p of sel) {
    previos[p.id] = p.precio_actual;
    precios[p.id] = args.descuento_pct
      ? Math.max(p.precio_minimo, redondear(p.precio_actual * (1 - args.descuento_pct / 100), reglas.redondeo))
      : p.precio_minimo;
  }
  return {
    crash: {
      id: args.id ?? `crash-${ahora}`,
      mensaje: args.mensaje?.trim() || "MARKET CRASH",
      productos: sel.map((p) => p.id),
      descuento_pct: args.descuento_pct ?? null,
      precios_previos: previos,
      inicio_at: new Date(ahora).toISOString(),
      fin_at: new Date(ahora + minutos * 60_000).toISOString(),
      finalizado: false,
      iniciado_por: args.usuario_id ?? null,
    },
    precios,
  };
}

/** Precios a restaurar al finalizar un crash. */
export function finalizarMarketCrash(crash: MarketCrash): Record<string, number> {
  return { ...crash.precios_previos };
}

/** Variación porcentual respecto del precio base (lo que muestra la TV). */
export const variacion = (actual: number, referencia: number) =>
  referencia > 0 ? Math.round(((actual - referencia) / referencia) * 1000) / 10 : 0;

/** Simulador para el panel del programador: evoluciona un precio con una serie de ventas. */
export function simularSerie(
  p: Pick<Producto, "precio_actual" | "precio_minimo" | "precio_maximo" | "objetivo_ventana">,
  ventasPorVentana: number[],
  costo: number,
  reglas: ReglasPrecios = REGLAS_DEFAULT,
): number[] {
  const serie = [p.precio_actual];
  let actual = { ...p };
  for (const v of ventasPorVentana) {
    const r = calcularPrecio(actual, v, costo, reglas);
    serie.push(r.precio);
    actual = { ...actual, precio_actual: r.precio };
  }
  return serie;
}
