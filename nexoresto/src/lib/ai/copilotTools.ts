// =============================================================================
//  FASE 7.3 · Herramientas del Copiloto (solo lectura + propuestas confirmables)
//  Se ejecutan en el SERVIDOR sobre un snapshot del bar (ya filtrado por bar_id
//  y por RLS). Ninguna herramienta modifica datos: las acciones se devuelven
//  como "propuestas" que el dueño/CM confirma con un clic en la interfaz.
// =============================================================================
import type { NexoState } from "../types";
import { calcularSugerenciasCompra, detectarAnomalias, estimarEstacion, getSmartUpsell } from "./learningEngine";
import { costoProducto, importeItem, nivelStock } from "../store/selectors";

export type Snapshot = Pick<NexoState, "bar" | "productos" | "categorias" | "insumos" | "recetas" | "pedidos" | "items" | "usuarios" | "mermas" | "turnos" | "movimientos" | "crash" | "promociones" | "fotos">;

export interface Grafico { tipo: "barras" | "linea"; titulo: string; unidad?: string; datos: { x: string; y: number }[] }
export interface Propuesta { tipo: "market_crash" | "promo" | "compra"; titulo: string; payload: Record<string, unknown>; motivo: string }

/** Definiciones JSON-Schema para la API de Claude (tool use). */
export const TOOL_DEFS = [
  {
    name: "ventas_por_producto",
    description: "Ranking de productos del bar por ganancia, unidades o facturación en un período. Devuelve unidades, ventas, costo de receta, ganancia y margen %. Usar para preguntas de rentabilidad ('¿qué trago me dejó más ganancia?').",
    input_schema: { type: "object", properties: {
      periodo_dias: { type: "number", description: "Días hacia atrás (1 = hoy/jornada, 7 = semana, 30 = mes)." },
      orden: { type: "string", enum: ["ganancia", "unidades", "ventas", "margen"] },
      categoria: { type: "string", description: "Filtrar por categoría (Tragos, Cervezas, Platos…). Opcional." },
      limite: { type: "number" },
    }, required: ["periodo_dias", "orden"], additionalProperties: false },
  },
  {
    name: "ventas_por_hora",
    description: "Facturación y cantidad de pedidos por franja horaria (detecta horas pico).",
    input_schema: { type: "object", properties: { periodo_dias: { type: "number" } }, required: ["periodo_dias"], additionalProperties: false },
  },
  {
    name: "stock_insumos",
    description: "Stock actual de insumos con mínimo, nivel (ok/bajo/crítico), costo unitario, proveedor y fecha de vencimiento.",
    input_schema: { type: "object", properties: { solo_alertas: { type: "boolean" }, buscar: { type: "string", description: "Texto para filtrar por nombre (ej: fernet)." } }, additionalProperties: false },
  },
  {
    name: "receta_y_margen",
    description: "Escandallo de un producto: ingredientes, cantidades, costo, precio actual, piso y tope del motor Exchange y margen.",
    input_schema: { type: "object", properties: { producto: { type: "string" } }, required: ["producto"], additionalProperties: false },
  },
  {
    name: "tiempos_kds",
    description: "Tiempos de preparación de cocina o barra: promedio del turno, objetivo, ETA actual, cola y desempeño por cocinero/bartender.",
    input_schema: { type: "object", properties: { estacion: { type: "string", enum: ["cocina", "barra"] }, periodo_dias: { type: "number" } }, required: ["estacion"], additionalProperties: false },
  },
  {
    name: "sugerencia_compras",
    description: "Lista de reposición proyectada para los próximos N días (promedio de las últimas 8 semanas del mismo día, o ritmo actual si no hay historia).",
    input_schema: { type: "object", properties: { dias: { type: "number" } }, additionalProperties: false },
  },
  {
    name: "anomalias_y_upsell",
    description: "Productos con demanda anormal (z-score vs su ritmo) y mejores combinaciones de upselling por afinidad y margen.",
    input_schema: { type: "object", properties: { producto: { type: "string", description: "Producto base para upselling (opcional)." } }, additionalProperties: false },
  },
  {
    name: "graficar",
    description: "Adjunta un gráfico a la respuesta para mostrar en el dashboard. Usalo cuando una comparación se entiende mejor visualmente (máx. 12 puntos).",
    input_schema: { type: "object", properties: {
      tipo: { type: "string", enum: ["barras", "linea"] }, titulo: { type: "string" }, unidad: { type: "string", description: "$, %, u., min" },
      datos: { type: "array", items: { type: "object", properties: { x: { type: "string" }, y: { type: "number" } }, required: ["x", "y"], additionalProperties: false } },
    }, required: ["tipo", "titulo", "datos"], additionalProperties: false },
  },
  {
    name: "proponer_accion",
    description: "Propone (NO ejecuta) una acción para que el dueño la confirme con un clic: lanzar un Market Crash, crear una promo o generar una orden de compra.",
    input_schema: { type: "object", properties: {
      tipo: { type: "string", enum: ["market_crash", "promo", "compra"] },
      titulo: { type: "string", description: "Texto corto del botón, ej: 'Crash de Fernet 10 min'." },
      motivo: { type: "string" },
      productos: { type: "array", items: { type: "string" }, description: "Nombres de productos (market_crash/promo)." },
      minutos: { type: "number" }, descuento_pct: { type: "number" },
      hora_desde: { type: "string" }, hora_hasta: { type: "string" },
      insumos: { type: "array", items: { type: "object", properties: { nombre: { type: "string" }, cantidad: { type: "number" } }, required: ["nombre", "cantidad"], additionalProperties: false } },
    }, required: ["tipo", "titulo", "motivo"], additionalProperties: false },
  },
] as const;

const DIA = 86400_000;
const buscarProd = (s: Snapshot, nombre: string) => {
  const n = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return s.productos.find((p) => p.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(n));
};

export function ejecutarHerramienta(s: Snapshot, nombre: string, input: Record<string, unknown>, salida: { graficos: Grafico[]; propuestas: Propuesta[] }, ahora = Date.now()): unknown {
  const desde = (d: unknown) => ahora - Math.max(Number(d) || 1, 1) * DIA;
  switch (nombre) {
    case "ventas_por_producto": {
      const t0 = desde(input.periodo_dias);
      const validos = new Set(s.pedidos.filter((p) => new Date(p.created_at).getTime() >= t0 && p.estado !== "anulado").map((p) => p.id));
      const cat = typeof input.categoria === "string" ? s.categorias.find((c) => c.nombre.toLowerCase().startsWith(String(input.categoria).toLowerCase()))?.id : undefined;
      const filas = s.productos.filter((p) => !cat || p.categoria_id === cat).map((p) => {
        const its = s.items.filter((i) => i.producto_id === p.id && validos.has(i.pedido_id) && i.estado_cocina !== "anulado");
        const ventas = its.reduce((a, i) => a + importeItem(i), 0);
        const costo = its.reduce((a, i) => a + i.cantidad * i.costo_unitario, 0);
        return { producto: p.nombre, unidades: its.reduce((a, i) => a + i.cantidad, 0), ventas: Math.round(ventas), costo: Math.round(costo), ganancia: Math.round(ventas - costo), margen_pct: ventas ? Math.round(((ventas - costo) / ventas) * 1000) / 10 : 0, precio_actual: p.precio_actual };
      });
      const k = (input.orden as string) ?? "ganancia";
      filas.sort((a, b) => (b[k as keyof typeof b] as number) - (a[k as keyof typeof a] as number));
      return { periodo_dias: input.periodo_dias, productos: filas.slice(0, Number(input.limite) || 10) };
    }
    case "ventas_por_hora": {
      const t0 = desde(input.periodo_dias);
      const m = new Map<number, { ventas: number; pedidos: number }>();
      for (const p of s.pedidos) {
        const t = new Date(p.created_at).getTime();
        if (t < t0 || p.estado === "anulado") continue;
        const h = new Date(t).getHours();
        const b = m.get(h) ?? { ventas: 0, pedidos: 0 };
        b.ventas += p.subtotal - p.descuento; b.pedidos += 1; m.set(h, b);
      }
      return [...m.entries()].sort((a, b) => ((a[0] + 18) % 24) - ((b[0] + 18) % 24)).map(([h, v]) => ({ hora: `${String(h).padStart(2, "0")}:00`, ventas: Math.round(v.ventas), pedidos: v.pedidos }));
    }
    case "stock_insumos": {
      const q = typeof input.buscar === "string" ? input.buscar.toLowerCase() : "";
      return s.insumos.filter((i) => (!input.solo_alertas || nivelStock(i) !== "ok") && (!q || i.nombre.toLowerCase().includes(q)))
        .map((i) => ({ insumo: i.nombre, unidad: i.unidad, stock: i.stock_actual, minimo: i.stock_minimo, nivel: nivelStock(i), costo_unitario: i.costo_unitario, proveedor: i.proveedor, vence_el: i.vence_el ?? null }));
    }
    case "receta_y_margen": {
      const p = buscarProd(s, String(input.producto ?? ""));
      if (!p) return { error: `No encontré el producto "${input.producto}". Productos: ${s.productos.map((x) => x.nombre).join(", ")}` };
      const costo = costoProducto(s, p.id);
      return {
        producto: p.nombre, precio_actual: p.precio_actual, precio_base: p.precio_base, precio_minimo: p.precio_minimo, precio_maximo: p.precio_maximo, costo_receta: costo,
        margen_pct_actual: Math.round((1 - costo / p.precio_actual) * 1000) / 10, margen_pct_en_minimo: Math.round((1 - costo / p.precio_minimo) * 1000) / 10,
        ingredientes: s.recetas.filter((r) => r.producto_id === p.id).map((r) => { const i = s.insumos.find((x) => x.id === r.insumo_id)!; return { insumo: i.nombre, cantidad: r.cantidad, unidad: i.unidad, costo: Math.round(r.cantidad * i.costo_unitario) }; }),
      };
    }
    case "tiempos_kds": {
      const est = input.estacion === "barra" ? "barra" : "cocina";
      const e = estimarEstacion(s as NexoState, est, ahora);
      const nombres = Object.fromEntries(s.usuarios.map((u) => [u.id, u.nombre]));
      return { ...e, cocineros: (e.cocineros ?? []).map((c) => ({ ...c, nombre: nombres[c.nombre] ?? c.nombre })), nota: "Demora = desde que entra la comanda hasta que la estación la marca LISTA." };
    }
    case "sugerencia_compras":
      return calcularSugerenciasCompra(s as NexoState, Number(input.dias) || 4, ahora).slice(0, 15);
    case "anomalias_y_upsell": {
      const base = typeof input.producto === "string" ? buscarProd(s, input.producto) : undefined;
      return {
        anomalias: detectarAnomalias(s as NexoState, ahora).slice(0, 6).map((a) => ({ producto: a.producto.nombre, ultimos_30_min: a.ultima, promedio: a.media, z: a.z })),
        upsell: base ? getSmartUpsell(s as NexoState, [base.id], 3).map((u) => ({ producto: u.producto.nombre, confianza: Math.round(u.confianza * 100) / 100, margen_pct: Math.round(u.margen * 100), razon: u.razon })) : [],
      };
    }
    case "graficar": {
      const datos = Array.isArray(input.datos) ? (input.datos as { x: string; y: number }[]).slice(0, 12).map((d) => ({ x: String(d.x), y: Number(d.y) || 0 })) : [];
      salida.graficos.push({ tipo: input.tipo === "linea" ? "linea" : "barras", titulo: String(input.titulo ?? ""), unidad: typeof input.unidad === "string" ? input.unidad : undefined, datos });
      return { ok: true, mostrado: true };
    }
    case "proponer_accion": {
      const tipo = input.tipo as Propuesta["tipo"];
      const payload: Record<string, unknown> = { ...input };
      if (Array.isArray(input.productos)) payload.producto_ids = (input.productos as string[]).map((n) => buscarProd(s, n)?.id).filter(Boolean);
      if (Array.isArray(input.insumos)) payload.items = (input.insumos as { nombre: string; cantidad: number }[]).map((x) => ({ insumo_id: s.insumos.find((i) => i.nombre.toLowerCase().includes(x.nombre.toLowerCase()))?.id, cantidad: x.cantidad })).filter((x) => x.insumo_id);
      salida.propuestas.push({ tipo, titulo: String(input.titulo), motivo: String(input.motivo ?? ""), payload });
      return { ok: true, estado: "pendiente_de_confirmacion", nota: "El usuario verá un botón para confirmar. No digas que ya se ejecutó." };
    }
    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

/** Respuesta local sin LLM (cuando no hay ANTHROPIC_API_KEY): usa las mismas herramientas. */
export function respuestaLocal(s: Snapshot, pregunta: string): { texto: string; graficos: Grafico[]; propuestas: Propuesta[] } {
  const salida = { graficos: [] as Grafico[], propuestas: [] as Propuesta[] };
  const q = pregunta.toLowerCase();
  const money = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
  if (/(ganancia|rentab|margen|dej[oó])/.test(q)) {
    const cat = /trago|bebida|drink/.test(q) ? "Tragos" : /plato|comida/.test(q) ? "Platos" : undefined;
    const r = ejecutarHerramienta(s, "ventas_por_producto", { periodo_dias: /mes/.test(q) ? 30 : /semana/.test(q) ? 7 : 1, orden: "ganancia", categoria: cat, limite: 6 }, salida) as { productos: { producto: string; ganancia: number; margen_pct: number; unidades: number }[] };
    const top = r.productos[0];
    ejecutarHerramienta(s, "graficar", { tipo: "barras", titulo: "Ganancia por producto", unidad: "$", datos: r.productos.map((p) => ({ x: p.producto, y: p.ganancia })) }, salida);
    return { texto: top ? `**${top.producto}** es el que más ganancia dejó: ${money(top.ganancia)} con ${top.unidades} unidades y ${top.margen_pct} % de margen. Te dejo el ranking completo en el gráfico.` : "Todavía no hay ventas en ese período.", ...salida };
  }
  if (/(cociner|bartender|tiempo|demora|r[aá]pido)/.test(q)) {
    const est = /barra|bartender|trago/.test(q) ? "barra" : "cocina";
    const r = ejecutarHerramienta(s, "tiempos_kds", { estacion: est }, salida) as ReturnType<typeof estimarEstacion>;
    return { texto: `En ${est} el promedio del turno es **${r.demora_prom_turno_min} min** (objetivo ${r.demora_objetivo_min} min). Hay ${r.en_cola} ítems en cola y un pedido nuevo saldría en ~${Math.round(r.eta_nuevo_pedido_min)} min.`, ...salida };
  }
  if (/(compr|stock|reponer|falta)/.test(q)) {
    const r = calcularSugerenciasCompra(s as NexoState, 4).slice(0, 6);
    ejecutarHerramienta(s, "proponer_accion", { tipo: "compra", titulo: `Orden de compra (${r.length} insumos)`, motivo: "Cobertura menor a 4 días", insumos: r.map((x) => ({ nombre: x.insumo, cantidad: x.sugerido })) }, salida);
    return { texto: `Para los próximos 4 días te sugiero reponer: ${r.map((x) => `${x.insumo} (${x.sugerido} ${x.unidad})`).join(", ")}. Podés generar la orden con el botón.`, ...salida };
  }
  if (/(promo|liquidar|vence|crash)/.test(q)) {
    const fer = buscarProd(s, /fernet/.test(q) ? "fernet" : "gin");
    if (fer) ejecutarHerramienta(s, "proponer_accion", { tipo: "market_crash", titulo: `Market Crash de ${fer.nombre} · 10 min`, motivo: "Liquidar stock manteniendo margen sobre el piso", productos: [fer.nombre], minutos: 10 }, salida);
    return { texto: `Propuesta: un **Market Crash de 10 minutos** en ${fer?.nombre} lo lleva a su precio mínimo (${money(fer?.precio_minimo ?? 0)}), que igual cubre el costo × 1,35. Combinalo con un posteo del CM y la alerta en la TV.`, ...salida };
  }
  const r = ejecutarHerramienta(s, "ventas_por_hora", { periodo_dias: 1 }, salida) as { hora: string; ventas: number }[];
  ejecutarHerramienta(s, "graficar", { tipo: "linea", titulo: "Ventas por hora (hoy)", unidad: "$", datos: r.map((x) => ({ x: x.hora, y: x.ventas })) }, salida);
  const pico = [...r].sort((a, b) => b.ventas - a.ventas)[0];
  return { texto: `Modo sin conexión (configurá ANTHROPIC_API_KEY para el copiloto completo). Hoy la hora pico fue **${pico?.hora ?? "—"}** con ${money(pico?.ventas ?? 0)}. Probá preguntarme por ganancia, stock, tiempos de cocina o una promo.`, ...salida };
}
