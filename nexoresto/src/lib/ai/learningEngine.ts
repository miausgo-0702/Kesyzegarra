// =============================================================================
//  FASE 7 · Motor de aprendizaje estadístico (sin LLM, explicable y gratis)
//  Corre en el navegador (modo demo) o en el servidor contra Supabase.
//  Las mismas ideas están en SQL: ia_sugerencia_compras, ia_upsell, ia_eta_estacion.
// =============================================================================
import type { Estacion, IaRecomendacion, NexoState, PedidoItem, Producto } from "../types";
import { costoProducto, inicioTurnoOperativo, minutosDesde, nivelStock } from "../store/selectors";

const DIA = 86400_000;
const HORAS_SERVICIO = 7; // 19:00 → 02:00

// -----------------------------------------------------------------------------
// 1. Sugerencias de compra
//    Proyecta los próximos `dias` usando el promedio de las últimas 8 semanas
//    del MISMO día de la semana. Si todavía no hay 8 semanas de historia,
//    extrapola el ritmo de la jornada actual (y lo marca como "baja confianza").
// -----------------------------------------------------------------------------
export interface SugerenciaCompra {
  insumo_id: string;
  insumo: string;
  unidad: string;
  proveedor: string;
  stock_actual: number;
  consumo_proyectado: number;
  stock_minimo: number;
  sugerido: number;
  costo_estimado: number;
  cobertura_dias: number;
  confianza: "alta" | "media" | "baja";
}

export function proyectarUnidades(s: NexoState, dias = 4, ahora = Date.now()): { porProducto: Map<string, number>; confianza: SugerenciaCompra["confianza"] } {
  const items = s.items.filter((i) => i.estado_cocina !== "anulado");
  const primera = items.reduce((m, i) => Math.min(m, new Date(i.creado_at).getTime()), ahora);
  const semanasHist = Math.floor((ahora - primera) / (7 * DIA));
  const porProducto = new Map<string, number>();

  if (semanasHist >= 1) {
    const semanas = Math.min(semanasHist, 8);
    for (let d = 0; d < dias; d++) {
      const dow = new Date(ahora + d * DIA).getDay();
      for (const it of items) {
        const t = new Date(it.creado_at).getTime();
        if (t < ahora - semanas * 7 * DIA || new Date(t).getDay() !== dow) continue;
        porProducto.set(it.producto_id, (porProducto.get(it.producto_id) ?? 0) + it.cantidad / semanas);
      }
    }
    return { porProducto, confianza: semanas >= 8 ? "alta" : "media" };
  }

  // Fallback: ritmo de la jornada actual × horas de servicio × días
  const t0 = inicioTurnoOperativo(new Date(ahora)).getTime();
  const deHoy = items.filter((i) => new Date(i.creado_at).getTime() >= t0);
  const horas = Math.max((ahora - Math.min(...deHoy.map((i) => new Date(i.creado_at).getTime()), ahora)) / 3600_000, 1);
  for (const it of deHoy) porProducto.set(it.producto_id, (porProducto.get(it.producto_id) ?? 0) + (it.cantidad / horas) * HORAS_SERVICIO * dias);
  return { porProducto, confianza: "baja" };
}

export function calcularSugerenciasCompra(s: NexoState, dias = 4, ahora = Date.now()): SugerenciaCompra[] {
  const { porProducto, confianza } = proyectarUnidades(s, dias, ahora);
  const consumo = new Map<string, number>();
  for (const r of s.recetas) {
    const u = porProducto.get(r.producto_id);
    if (u) consumo.set(r.insumo_id, (consumo.get(r.insumo_id) ?? 0) + u * r.cantidad);
  }
  return s.insumos
    .map((i) => {
      const proy = consumo.get(i.id) ?? 0;
      const necesario = proy + i.stock_minimo - i.stock_actual;
      const paso = i.unidad === "u" ? 1 : i.unidad === "ml" || i.unidad === "g" ? 250 : 1;
      const sugerido = necesario > 0 ? Math.ceil(necesario / paso) * paso : 0;
      return {
        insumo_id: i.id, insumo: i.nombre, unidad: i.unidad, proveedor: i.proveedor, stock_actual: i.stock_actual,
        consumo_proyectado: Math.round(proy), stock_minimo: i.stock_minimo, sugerido,
        costo_estimado: Math.round(sugerido * i.costo_unitario),
        cobertura_dias: proy > 0 ? Math.round((Math.max(i.stock_actual, 0) / (proy / dias)) * 10) / 10 : 99,
        confianza,
      };
    })
    .filter((x) => x.sugerido > 0)
    .sort((a, b) => a.cobertura_dias - b.cobertura_dias);
}

// -----------------------------------------------------------------------------
// 2. Upselling en tiempo real
//    score = confianza(A→B) × margen(B) × disponibilidad(B)
//    confianza(A→B) = pedidos con A y B / pedidos con A   (market basket)
// -----------------------------------------------------------------------------
export interface Upsell { producto: Producto; confianza: number; margen: number; score: number; razon: string }

export function matrizAfinidad(s: NexoState) {
  const porPedido = new Map<string, Set<string>>();
  for (const it of s.items) {
    if (it.estado_cocina === "anulado") continue;
    if (!porPedido.has(it.pedido_id)) porPedido.set(it.pedido_id, new Set());
    porPedido.get(it.pedido_id)!.add(it.producto_id);
  }
  const frec = new Map<string, number>();
  const co = new Map<string, number>();
  for (const set of porPedido.values()) {
    const arr = [...set];
    for (const a of arr) {
      frec.set(a, (frec.get(a) ?? 0) + 1);
      for (const b of arr) if (a !== b) co.set(`${a}|${b}`, (co.get(`${a}|${b}`) ?? 0) + 1);
    }
  }
  return { frec, co, pedidos: porPedido.size };
}

export function getSmartUpsell(s: NexoState, carrito: string[], limite = 2): Upsell[] {
  const { frec, co, pedidos } = matrizAfinidad(s);
  const enCarrito = new Set(carrito);
  const estCarrito = new Set(s.productos.filter((p) => enCarrito.has(p.id)).map((p) => p.estacion));
  const sinStock = new Set(
    s.recetas.filter((r) => { const i = s.insumos.find((x) => x.id === r.insumo_id); return i && i.stock_actual < r.cantidad; }).map((r) => r.producto_id),
  );
  const out: Upsell[] = [];
  for (const p of s.productos) {
    if (!p.activo || enCarrito.has(p.id) || sinStock.has(p.id)) continue;
    let conf = 0;
    for (const a of carrito) {
      const fa = frec.get(a) ?? 0;
      if (fa) conf = Math.max(conf, (co.get(`${a}|${p.id}`) ?? 0) / fa);
    }
    // Prior suave: complementar estación (comida ↔ bebida) y popularidad global
    const prior = (estCarrito.size === 1 && !estCarrito.has(p.estacion) ? 0.12 : 0) + ((frec.get(p.id) ?? 0) / Math.max(pedidos, 1)) * 0.25;
    const confianza = carrito.length ? conf * 0.75 + prior : prior;
    const margen = p.precio_actual ? 1 - costoProducto(s, p.id) / p.precio_actual : 0;
    const score = confianza * margen;
    const razon = conf > 0.15 ? `${Math.round(conf * 100)} % de los que piden esto lo suman` : !estCarrito.has(p.estacion) ? (p.estacion === "barra" ? "Ideal para acompañar" : "Para picar algo") : "Muy pedido hoy";
    out.push({ producto: p, confianza, margen, score, razon });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limite);
}

// -----------------------------------------------------------------------------
// 3. Tiempos de cocina: carga actual × velocidad del turno → ETA y anomalías
// -----------------------------------------------------------------------------
export interface EstadoEstacion {
  estacion: Estacion;
  en_cola: number;
  demora_prom_turno_min: number;
  demora_objetivo_min: number;
  eta_nuevo_pedido_min: number;
  desvio_min: number;           // ETA − objetivo
  mas_antiguo_min: number;
  cocineros?: { nombre: string; items: number; prom_min: number }[];
}

export function estimarEstacion(s: NexoState, estacion: Estacion, ahora = Date.now()): EstadoEstacion {
  const t0 = ahora - 3 * 3600_000;
  const listos = s.items.filter((i) => i.estacion === estacion && i.listo_at && new Date(i.listo_at).getTime() > t0);
  const durs = listos.map((i) => (new Date(i.listo_at!).getTime() - new Date(i.creado_at).getTime()) / 60000).filter((m) => m > 0 && m < 120);
  const prom = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : estacion === "cocina" ? 12 : 4;
  const cola = s.items.filter((i) => i.estacion === estacion && (i.estado_cocina === "pendiente" || i.estado_cocina === "marchando"));
  const unidades = cola.reduce((a, i) => a + i.cantidad, 0);
  const objetivo = (() => {
    const ps = s.productos.filter((p) => p.estacion === estacion);
    return ps.reduce((a, p) => a + p.tiempo_objetivo_min, 0) / Math.max(ps.length, 1);
  })();
  // Capacidad paralela de la estación: hasta `paralelos` unidades sin agregar espera
  const paralelos = estacion === "cocina" ? 8 : 10;
  const eta = prom * (1 + Math.max(0, unidades - paralelos) / (paralelos * 2));
  const masAntiguo = cola.reduce((m, i) => Math.max(m, minutosDesde(i.creado_at, ahora)), 0);

  const porCocinero = new Map<string, number[]>();
  for (const i of listos) {
    if (!i.preparado_por) continue;
    const d = (new Date(i.listo_at!).getTime() - new Date(i.creado_at).getTime()) / 60000;
    porCocinero.set(i.preparado_por, [...(porCocinero.get(i.preparado_por) ?? []), d]);
  }
  return {
    estacion, en_cola: unidades, demora_prom_turno_min: round1(prom), demora_objetivo_min: round1(objetivo),
    eta_nuevo_pedido_min: round1(eta), desvio_min: round1(eta - objetivo), mas_antiguo_min: round1(masAntiguo),
    cocineros: [...porCocinero.entries()].map(([nombre, ds]) => ({ nombre, items: ds.length, prom_min: round1(ds.reduce((a, b) => a + b, 0) / ds.length) })),
  };
}
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Productos con ventas muy por debajo/encima de su ritmo (z-score simple sobre ventanas de 30 min). */
export function detectarAnomalias(s: NexoState, ahora = Date.now()) {
  const ventana = 30 * 60_000;
  const t0 = inicioTurnoOperativo(new Date(ahora)).getTime();
  const ventanas = Math.max(Math.floor((ahora - t0) / ventana), 1);
  return s.productos.filter((p) => p.activo).map((p) => {
    const its = s.items.filter((i) => i.producto_id === p.id && i.estado_cocina !== "anulado" && new Date(i.creado_at).getTime() >= t0);
    const counts = Array.from({ length: ventanas }, (_, k) => its.filter((i) => Math.floor((new Date(i.creado_at).getTime() - t0) / ventana) === k).reduce((a, i) => a + i.cantidad, 0));
    const ult = counts[counts.length - 1] ?? 0;
    const prev = counts.slice(0, -1);
    const media = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : ult;
    const sd = prev.length > 1 ? Math.sqrt(prev.reduce((a, b) => a + (b - media) ** 2, 0) / (prev.length - 1)) : 1;
    return { producto: p, ultima: ult, media: round1(media), z: round1((ult - media) / Math.max(sd, 0.5)) };
  }).filter((x) => Math.abs(x.z) >= 1.5).sort((a, b) => Math.abs(b.z) - Math.abs(a.z));
}

// -----------------------------------------------------------------------------
// 4. Recomendaciones proactivas (las 3 tarjetas "Aplicar en 1 clic")
// -----------------------------------------------------------------------------
export type RecoNueva = Omit<IaRecomendacion, "id" | "created_at" | "estado">;

export function generarRecomendaciones(s: NexoState, ahora = Date.now()): RecoNueva[] {
  const recos: RecoNueva[] = [];

  // a) Compra urgente (cobertura < 1 día)
  const compras = calcularSugerenciasCompra(s, 4, ahora);
  const urgentes = compras.filter((c) => c.cobertura_dias < 1.5 || nivelStock(s.insumos.find((i) => i.id === c.insumo_id)!) === "critico");
  if (urgentes.length) {
    const c = urgentes[0];
    recos.push({
      tipo: "compra", prioridad: 1,
      titulo: `Comprar ${fmtCant(c.sugerido, c.unidad)} de ${c.insumo}`,
      detalle: `Cobertura ${c.cobertura_dias < 1 ? "menor a 1 día" : `de ${c.cobertura_dias} días`} con la demanda proyectada. ${urgentes.length > 1 ? `+${urgentes.length - 1} insumos más en la orden sugerida.` : ""} Proveedor: ${c.proveedor}.`,
      accion: { tipo: "compra", items: urgentes.slice(0, 6).map((u) => ({ insumo_id: u.insumo_id, cantidad: u.sugerido })) },
    });
  }

  // b) Market Crash para liquidar un trago con stock alto y demanda baja
  const anom = detectarAnomalias(s, ahora);
  const lento = s.productos
    .filter((p) => p.estacion === "barra" && p.es_cotizable_bolsa && p.precio_actual <= p.precio_base)
    .map((p) => ({ p, a: anom.find((x) => x.producto.id === p.id), margen: 1 - costoProducto(s, p.id) / Math.max(p.precio_minimo, 1) }))
    .filter((x) => x.margen > 0.45)
    .sort((x, y) => (x.a?.z ?? 0) - (y.a?.z ?? 0) || x.p.variacion_porcentaje - y.p.variacion_porcentaje)[0];
  if (lento && !s.crash) {
    recos.push({
      tipo: "market_crash", prioridad: 2,
      titulo: `Activar Market Crash en ${lento.p.nombre}`,
      detalle: `Viene ${lento.p.variacion_porcentaje.toFixed(1)} % vs base y con poca rotación. Aun en el precio mínimo ($${lento.p.precio_minimo}) deja ${Math.round(lento.margen * 100)} % de margen.`,
      accion: { tipo: "market_crash", productos: [lento.p.id], minutos: 10 },
    });
  }

  // c) Demora proyectada en cocina / barra
  for (const est of ["cocina", "barra"] as const) {
    const e = estimarEstacion(s, est, ahora);
    if (e.desvio_min >= 3 || e.mas_antiguo_min >= 18) {
      recos.push({
        tipo: "demora_cocina", prioridad: e.mas_antiguo_min >= 18 ? 1 : 2,
        titulo: `Demora proyectada +${Math.max(Math.round(e.desvio_min), 1)} min en ${est === "cocina" ? "Cocina" : "Barra"}`,
        detalle: `${e.en_cola} ítems en cola, comanda más antigua ${Math.round(e.mas_antiguo_min)} min. ETA de un pedido nuevo: ${Math.round(e.eta_nuevo_pedido_min)} min. Sugerencia: avisar a los mozos y pausar platos lentos en la carta QR.`,
        accion: { tipo: "aviso_mozos", estacion: est, eta: Math.round(e.eta_nuevo_pedido_min) },
      });
      break;
    }
  }

  // d) Producto en alza → aprovechar con promo / upsell
  const alza = anom.find((x) => x.z >= 2);
  if (alza && recos.length < 3) {
    recos.push({
      tipo: "upsell", prioridad: 3,
      titulo: `${alza.producto.nombre} vuela: sugerilo como acompañamiento`,
      detalle: `${alza.ultima} unidades en los últimos 30 min (promedio ${alza.media}). Activá el upsell en la carta QR y la tablet del mozo.`,
      accion: { tipo: "destacar", productos: [alza.producto.id] },
    });
  }
  // e) Promo de cierre si queda poco para cerrar y hay stock de cerveza
  if (recos.length < 3) {
    const cerveza = s.productos.find((p) => p.icono === "beer");
    if (cerveza) recos.push({ tipo: "promo", prioridad: 3, titulo: `Happy Hour de cierre en ${cerveza.nombre}`, detalle: "Stock de barril holgado para 4+ días. Una promo 2×1 en la última hora mejora el ticket sin tocar el margen de tragos.", accion: { tipo: "promo", titulo: `2×1 en ${cerveza.nombre}`, categoria_id: cerveza.categoria_id } });
  }
  return recos.sort((a, b) => a.prioridad - b.prioridad).slice(0, 3);
}

const fmtCant = (n: number, u: string) => {
  const f = (x: number) => x.toLocaleString("es-AR", { maximumFractionDigits: 1 });
  return u === "g" && n >= 1000 ? `${f(n / 1000)} kg` : u === "ml" && n >= 1000 ? `${f(n / 1000)} L` : `${f(n)} ${u === "u" ? "u." : u}`;
};

export const itemsActivos = (s: NexoState, est: Estacion): PedidoItem[] =>
  s.items.filter((i) => i.estacion === est && (i.estado_cocina === "pendiente" || i.estado_cocina === "marchando"));
