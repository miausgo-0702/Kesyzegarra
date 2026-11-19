// Cálculos derivados compartidos por todas las pantallas (puros).
import type { MedioPago, NexoState, Pedido, PedidoItem, Producto } from "../types";
import { crashActivo } from "../exchangeEngine";

export function costoProducto(s: Pick<NexoState, "recetas" | "insumos">, productoId: string): number {
  let c = 0;
  for (const r of s.recetas) {
    if (r.producto_id !== productoId) continue;
    const i = s.insumos.find((x) => x.id === r.insumo_id);
    if (i) c += r.cantidad * i.costo_unitario;
  }
  return Math.round(c);
}

export function costosMap(s: Pick<NexoState, "recetas" | "insumos" | "productos">): Record<string, number> {
  const m: Record<string, number> = {};
  for (const p of s.productos) m[p.id] = costoProducto(s, p.id);
  return m;
}

export const extrasItem = (it: Pick<PedidoItem, "modificadores">) => it.modificadores.reduce((a, m) => a + m.precio_extra, 0);
export const importeItem = (it: PedidoItem) => it.estado_cocina === "anulado" ? 0 : it.cantidad * (it.precio_unitario + extrasItem(it));

export function itemsDe(s: NexoState, pedidoId: string) {
  return s.items.filter((i) => i.pedido_id === pedidoId);
}

export function pedidosAbiertosMesa(s: NexoState, mesaId: string): Pedido[] {
  return s.pedidos.filter((p) => p.mesa_id === mesaId && p.estado !== "cerrado" && p.estado !== "anulado");
}

export function saldoMesa(s: NexoState, mesaId: string) {
  const peds = pedidosAbiertosMesa(s, mesaId);
  const total = peds.reduce((a, p) => a + p.total, 0);
  const pagado = peds.reduce((a, p) => a + p.pagado, 0);
  return { pedidos: peds, total, pagado, saldo: Math.max(total - pagado, 0) };
}

export function enCrash(s: NexoState, productoId: string, ahora = Date.now()) {
  return crashActivo(s.crash, ahora) && !!s.crash?.productos.includes(productoId);
}

export function minutosDesde(iso: string | null | undefined, ahora = Date.now()) {
  if (!iso) return 0;
  return (ahora - new Date(iso).getTime()) / 60000;
}

export type Semaforo = "verde" | "amarillo" | "rojo";
export function semaforo(min: number): Semaforo {
  return min >= 18 ? "rojo" : min >= 10 ? "amarillo" : "verde";
}

export function inicioTurnoOperativo(ahora = new Date()): Date {
  // La "jornada" del bar arranca a las 06:00 (un servicio nocturno cruza la medianoche)
  const d = new Date(ahora);
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  d.setHours(6, 0, 0, 0);
  return d;
}

export function kpisJornada(s: NexoState, desde = inicioTurnoOperativo()) {
  const t0 = desde.getTime();
  const peds = s.pedidos.filter((p) => new Date(p.created_at).getTime() >= t0 && p.estado !== "anulado");
  const ids = new Set(peds.map((p) => p.id));
  const items = s.items.filter((i) => ids.has(i.pedido_id) && i.estado_cocina !== "anulado");
  const ventas = items.reduce((a, i) => a + importeItem(i), 0);
  const costo = items.reduce((a, i) => a + i.cantidad * i.costo_unitario, 0);
  const cerrados = peds.filter((p) => p.estado === "cerrado");
  const ticket = cerrados.length ? cerrados.reduce((a, p) => a + p.total - p.propina, 0) / cerrados.length : ventas / Math.max(peds.length, 1);
  const mermas = s.mermas.filter((m) => new Date(m.created_at).getTime() >= t0).reduce((a, m) => {
    const i = s.insumos.find((x) => x.id === m.insumo_id);
    return a + (i ? i.costo_unitario * m.cantidad : 0);
  }, 0);
  return {
    pedidos: peds.length,
    ventas,
    costo,
    ganancia: ventas - costo - mermas,
    margen: ventas ? ((ventas - costo) / ventas) * 100 : 0,
    costoPct: ventas ? (costo / ventas) * 100 : 0,
    ticket,
    mermas,
    items,
  };
}

export function ventasPorHora(s: NexoState, desde = inicioTurnoOperativo()) {
  const t0 = desde.getTime();
  const buckets = new Map<number, { ventas: number; pedidos: number }>();
  for (const p of s.pedidos) {
    const t = new Date(p.created_at).getTime();
    if (t < t0 || p.estado === "anulado") continue;
    const h = new Date(t).getHours();
    const b = buckets.get(h) ?? { ventas: 0, pedidos: 0 };
    b.ventas += p.subtotal - p.descuento;
    b.pedidos += 1;
    buckets.set(h, b);
  }
  const horas = [...buckets.keys()].sort((a, b) => ((a + 18) % 24) - ((b + 18) % 24));
  return horas.map((h) => ({ hora: `${String(h).padStart(2, "0")}:00`, ...buckets.get(h)! }));
}

export function rentabilidadProductos(s: NexoState, desde = inicioTurnoOperativo()) {
  const t0 = desde.getTime();
  const pedidosValidos = new Set(s.pedidos.filter((p) => new Date(p.created_at).getTime() >= t0 && p.estado !== "anulado").map((p) => p.id));
  return s.productos.map((p) => {
    const its = s.items.filter((i) => i.producto_id === p.id && pedidosValidos.has(i.pedido_id) && i.estado_cocina !== "anulado");
    const unidades = its.reduce((a, i) => a + i.cantidad, 0);
    const ventas = its.reduce((a, i) => a + importeItem(i), 0);
    const costoU = costoProducto(s, p.id);
    const ganancia = ventas - its.reduce((a, i) => a + i.cantidad * i.costo_unitario, 0);
    const margen = p.precio_actual ? (1 - costoU / p.precio_actual) * 100 : 0;
    return { producto: p, unidades, ventas, ganancia, costo: costoU, margen };
  }).sort((a, b) => b.ganancia - a.ganancia);
}

export function esperadoTurno(s: NexoState, turnoId: string): Record<Exclude<MedioPago, "cupon">, number> {
  const t = s.turnos.find((x) => x.id === turnoId);
  const out = { efectivo: t?.fondo_inicial ?? 0, debito: 0, credito: 0, qr: 0, transferencia: 0 };
  for (const m of s.movimientos) {
    if (m.turno_id !== turnoId || m.medio === "cupon") continue;
    const signo = m.tipo === "egreso" || m.tipo === "retiro" ? -1 : 1;
    out[m.medio] += signo * m.monto;
  }
  return out;
}

export function nivelStock(i: { stock_actual: number; stock_minimo: number }): "critico" | "bajo" | "ok" {
  if (i.stock_actual < i.stock_minimo * 0.5) return "critico";
  if (i.stock_actual < i.stock_minimo) return "bajo";
  return "ok";
}

export function productosPorCategoria(s: NexoState, filtro?: (p: Producto) => boolean) {
  return s.categorias
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((c) => ({ categoria: c, productos: s.productos.filter((p) => p.categoria_id === c.id && p.activo && (!filtro || filtro(p))) }))
    .filter((g) => g.productos.length);
}
