// Estado inicial del MODO DEMO: un bar con una noche de servicio en curso
// (historial de precios, ventas de la jornada, comandas en cocina, delivery,
// fotos, reservas) para que todas las pantallas se vean vivas desde el inicio.
import type { Bar, FotoCliente, Mesa, NexoState, Pedido, PedidoItem, PuntoPrecio } from "../types";
import { REGLAS_DEFAULT, variacion } from "../exchangeEngine";
import { BAR_ID, BAR_SLUG, CATEGORIAS, INSUMOS, MESAS_RAW, MODIFICADORES, PRODUCTOS, RECETAS, SECTORES, USUARIOS, mesaId, prodId } from "./catalogo";
import { costoProducto, importeItem } from "./selectors";

export const STATE_VERSION = 4;

// PRNG determinista para que la demo sea reproducible
function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function crearEstadoInicial(ahora = Date.now()): NexoState {
  const rand = rng(20261118);
  let seq = 0;
  const uid = () => `d${(++seq).toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`;
  const iso = (t: number) => new Date(t).toISOString();
  const min = 60_000;

  const bar: Bar = {
    id: BAR_ID, slug: BAR_SLUG, nombre: "Bar Central", moneda: "ARS",
    reglas_precios: { ...REGLAS_DEFAULT },
    propina_sugerida_pct: 10, plan: "pro", estado_licencia: "activa", licencia_vence: iso(ahora + 200 * 86400_000),
    lat: -27.7834, lng: -64.2642, direccion: "Av. Belgrano 1100, Santiago del Estero", usuarios: 10, created_at: iso(ahora - 120 * 86400_000),
  };
  const bares: Bar[] = [
    bar,
    { ...bar, id: "00000000-0000-4000-8000-00000000b002", slug: "bodega-norte", nombre: "Bodega Norte", usuarios: 9, plan: "pro", lat: -27.77, lng: -64.25, direccion: "Av. Roca 450", created_at: iso(ahora - 80 * 86400_000) },
    { ...bar, id: "00000000-0000-4000-8000-00000000b003", slug: "terraza-rio", nombre: "Terraza Río", usuarios: 5, plan: "basico", estado_licencia: "prueba", licencia_vence: iso(ahora + 9 * 86400_000), lat: -27.79, lng: -64.27, direccion: "Costanera 120", created_at: iso(ahora - 5 * 86400_000) },
  ];

  const state: NexoState = {
    version: STATE_VERSION, bar, bares, usuarios: USUARIOS,
    categorias: CATEGORIAS, productos: PRODUCTOS.map((p) => ({ ...p })), modificadores: MODIFICADORES,
    insumos: INSUMOS.map((i) => ({ ...i })), recetas: RECETAS, sectores: SECTORES,
    mesas: MESAS_RAW.map(([n, s, cap]): Mesa => ({ id: mesaId(n), sector_id: SECTORES[s - 1].id, numero: n, capacidad: cap, estado: "libre", mozo_id: null, ocupada_desde: null, qr_token: `qr${n}x${(n * 7919).toString(36)}` })),
    pedidos: [], items: [], turnos: [], movimientos: [], cupones: [], historial: {}, crash: null, crashes: [], envios: [],
    eventos: [], promociones: [], fotos: [], votos: [], reservas: [], espera: [], auditoria: [], logs: [], compras: [], mermas: [],
    recomendaciones: [], notificaciones: [], ultimo_tick: ahora, simulacion: true,
  };

  // ---- 1. Historial de precios (60 ticks) con tendencias distintas por producto
  const tendencia: Record<number, number> = { 1: 0.9, 2: -0.4, 3: 0.6, 4: 0.35, 5: -0.5, 6: 0.1, 7: -0.3, 8: 0.2, 9: -0.45, 10: 0.5, 11: -0.1, 12: 0.3, 13: 0.15, 14: -0.2, 15: 0.25, 16: 0.1 };
  state.productos = state.productos.map((p, idx) => {
    if (!p.es_cotizable_bolsa) { state.historial[p.id] = []; return p; }
    const tr = tendencia[idx + 1] ?? 0;
    const hist: PuntoPrecio[] = [];
    let precio = p.precio_base * (1 - tr * 0.08);
    for (let k = 59; k >= 0; k--) {
      precio *= 1 + (tr * 0.004 + (rand() - 0.5) * 0.022);
      precio = Math.min(Math.max(precio, p.precio_minimo), p.precio_maximo);
      hist.push({ t: ahora - k * 30_000 - 25 * min, p: Math.round(precio / 50) * 50 });
    }
    const actual = hist[hist.length - 1].p;
    state.historial[p.id] = hist;
    return { ...p, precio_actual: actual, precio_anterior: hist[hist.length - 2].p, variacion_porcentaje: variacion(actual, p.precio_base) };
  });

  // ---- 2. Ventas de la jornada (desde las 19:00 o hace 4 h) ya cobradas
  const turnoId = uid();
  const caja = USUARIOS.find((u) => u.rol === "caja")!;
  const mozos = USUARIOS.filter((u) => u.rol === "mozo");
  const inicio = Math.min(ahora - 4 * 60 * min, new Date(new Date(ahora).setHours(19, 0, 0, 0)).getTime() > ahora ? ahora - 4 * 60 * min : new Date(new Date(ahora).setHours(19, 0, 0, 0)).getTime());
  state.turnos.push({ id: turnoId, caja_nombre: "Caja 1", cajero_id: caja.id, estado: "abierto", fondo_inicial: 20000, apertura_at: iso(inicio - 30 * min), cierre_at: null, declarado: null, esperado: null, diferencia_total: null });
  // Turno de ayer (para auditoría)
  state.turnos.push({ id: uid(), caja_nombre: "Caja 2", cajero_id: caja.id, estado: "cerrado", fondo_inicial: 15000, apertura_at: iso(ahora - 26 * 3600_000), cierre_at: iso(ahora - 17 * 3600_000), declarado: { efectivo: 187700, qr: 96400, debito: 41000, credito: 22800, transferencia: 0 }, esperado: { efectivo: 188900, qr: 96400, debito: 41000, credito: 22800, transferencia: 0 }, diferencia_total: -1200 });

  const pesos = PRODUCTOS.map((p, i) => (p.estacion === "barra" ? 3 : 2) + (i % 3 === 0 ? 1.5 : 0));
  const pick = () => {
    const tot = pesos.reduce((a, b) => a + b, 0);
    let r = rand() * tot;
    for (let i = 0; i < pesos.length; i++) { r -= pesos[i]; if (r <= 0) return PRODUCTOS[i]; }
    return PRODUCTOS[0];
  };
  const medios = ["efectivo", "qr", "qr", "debito", "credito", "transferencia"] as const;
  let numero = 100;
  const span = ahora - 25 * min - inicio;
  for (let k = 0; k < 68; k++) {
    // curva de demanda: pico hacia el final
    const x = Math.pow(rand(), 0.75);
    const t = inicio + x * span;
    const mesaN = 1 + Math.floor(rand() * 18);
    const pedido: Pedido = {
      id: uid(), numero: ++numero, tipo: rand() < 0.22 ? "webapp_qr" : rand() < 0.1 ? "delivery" : "salon", estado: "cerrado",
      mesa_id: mesaId(mesaN), mozo_id: mozos[k % 2].id, cliente_nombre: null, cliente_telefono: null, direccion: null,
      subtotal: 0, descuento: 0, propina: 0, total: 0, pagado: 0, en_market_crash: false, idempotency_key: `seed-${k}`, created_at: iso(t), cerrado_at: iso(t + 50 * min),
    };
    if (pedido.tipo === "delivery") pedido.mesa_id = null;
    const n = 1 + Math.floor(rand() * 4);
    const its: PedidoItem[] = [];
    for (let j = 0; j < n; j++) {
      const p = pick();
      const hist = state.historial[p.id];
      const precio = hist?.length ? hist[Math.min(hist.length - 1, Math.floor(x * hist.length))].p : p.precio_actual;
      its.push({
        id: uid(), pedido_id: pedido.id, producto_id: p.id, nombre: p.nombre, cantidad: 1 + (rand() < 0.3 ? 1 : 0), precio_unitario: precio,
        costo_unitario: costoProducto(state, p.id), modificadores: [], notas: null, estacion: p.estacion, estado_cocina: "entregado",
        en_market_crash: false, persona: null, anulado_motivo: null, creado_at: iso(t), marchando_at: iso(t + 60_000),
        listo_at: iso(t + (p.tiempo_objetivo_min * (0.6 + rand() * 0.9)) * min), entregado_at: iso(t + (p.tiempo_objetivo_min + 2) * min), preparado_por: null,
      });
    }
    pedido.subtotal = its.reduce((a, i) => a + importeItem(i), 0);
    pedido.propina = rand() < 0.5 ? Math.round(pedido.subtotal * 0.1 / 50) * 50 : 0;
    pedido.total = pedido.subtotal + pedido.propina;
    pedido.pagado = pedido.total;
    state.pedidos.push(pedido);
    state.items.push(...its);
    state.movimientos.push({ id: uid(), turno_id: turnoId, pedido_id: pedido.id, tipo: "cobro", medio: medios[Math.floor(rand() * medios.length)], monto: pedido.subtotal, idempotency_key: `seed-pay-${k}:0`, created_at: iso(t + 50 * min) });
    if (pedido.propina) state.movimientos.push({ id: uid(), turno_id: turnoId, pedido_id: pedido.id, tipo: "propina", medio: "efectivo", monto: pedido.propina, idempotency_key: `seed-pay-${k}:propina`, created_at: iso(t + 50 * min) });
  }
  // una anulación auditada
  state.auditoria.push({ id: uid(), usuario: "Lucía Romero", accion: "anulacion_item", tipo: "operacion", detalle: "1× Milanesa napolitana · cliente se retiró", monto: 8200, created_at: iso(ahora - 95 * min) });
  state.auditoria.push({ id: uid(), usuario: "Martín Gómez", accion: "descuento", tipo: "caja", detalle: "Cupón FOTO-8F3A21 (20 %)", monto: 3640, created_at: iso(ahora - 70 * min) });
  state.auditoria.push({ id: uid(), usuario: "Martín Gómez", accion: "cierre_caja", tipo: "caja", detalle: "Caja 2 · diferencia de arqueo", monto: -1200, created_at: iso(ahora - 17 * 3600_000) });
  state.auditoria.push({ id: uid(), usuario: "Sofía Medina", accion: "market_crash", tipo: "precio", detalle: "3 productos · 10 min · \"Hora loca de gin\"", created_at: iso(ahora - 26 * 3600_000) });

  // ---- 3. Comandas en curso (KDS/BDS + mapa de mesas vivo)
  const enCurso: [mesa: number, minAtras: number, items: [prod: number, cant: number, mods?: string[], notas?: string][], estado?: "marchando"][] = [
    [6, 21, [[9, 2, ["A punto", "Sin cebolla"]], [12, 1], [11, 1, [], "bien cocida"], [1, 3]]],
    [7, 12, [[10, 1, ["Extra mozzarella"]], [13, 2, ["Sin croutones"]], [2, 2]], "marchando"],
    [3, 6, [[13, 1], [14, 1], [3, 1]]],
    [14, 4, [[10, 2, ["Sin orégano"]], [12, 1], [4, 2]]],
    [11, 2, [[11, 1, ["A la plancha"]], [13, 1], [5, 4]]],
    [2, 1, [[9, 2, ["Bien cocida"]], [7, 2]]],
  ];
  for (const [mesaN, atras, lista, est] of enCurso) {
    const t = ahora - atras * min;
    const pedido: Pedido = {
      id: uid(), numero: ++numero, tipo: "salon", estado: "confirmado", mesa_id: mesaId(mesaN), mozo_id: mozos[mesaN % 2].id,
      cliente_nombre: null, cliente_telefono: null, direccion: null, subtotal: 0, descuento: 0, propina: 0, total: 0, pagado: 0,
      en_market_crash: false, idempotency_key: `seed-live-${mesaN}`, created_at: iso(t), cerrado_at: null,
    };
    const its = lista.map(([pn, cant, mods, notas]): PedidoItem => {
      const p = state.productos.find((x) => x.id === prodId(pn))!;
      return {
        id: uid(), pedido_id: pedido.id, producto_id: p.id, nombre: p.nombre, cantidad: cant, precio_unitario: p.precio_actual,
        costo_unitario: costoProducto(state, p.id),
        modificadores: (mods ?? []).map((m) => { const mm = MODIFICADORES.find((x) => x.nombre === m); return { grupo: mm?.grupo ?? "Notas", nombre: m, precio_extra: mm?.precio_extra ?? 0 }; }),
        notas: notas ?? null, estacion: p.estacion, estado_cocina: est && p.estacion === "cocina" ? "marchando" : "pendiente", en_market_crash: false, persona: null,
        anulado_motivo: null, creado_at: iso(t), marchando_at: est ? iso(t + 2 * min) : null, listo_at: null, entregado_at: null, preparado_por: null,
      };
    });
    pedido.subtotal = its.reduce((a, i) => a + importeItem(i), 0);
    pedido.total = pedido.subtotal;
    state.pedidos.push(pedido);
    state.items.push(...its);
    state.mesas = state.mesas.map((m) => (m.numero === mesaN ? { ...m, estado: atras > 18 ? "demorada" : "esperando", ocupada_desde: iso(t - 10 * min), mozo_id: pedido.mozo_id } : m));
  }
  // Mesas ocupadas (ya comieron) y pidiendo cuenta
  for (const [n, est] of [[4, "ocupada"], [9, "ocupada"], [5, "cuenta_pedida"], [12, "cuenta_pedida"], [16, "ocupada"]] as const) {
    const t = ahora - (40 + n) * min;
    const pedido: Pedido = {
      id: uid(), numero: ++numero, tipo: "salon", estado: "entregado", mesa_id: mesaId(n), mozo_id: mozos[n % 2].id, cliente_nombre: null,
      cliente_telefono: null, direccion: null, subtotal: 0, descuento: 0, propina: 0, total: 0, pagado: 0, en_market_crash: false,
      idempotency_key: `seed-mesa-${n}`, created_at: iso(t), cerrado_at: null,
    };
    const lista: [number, number][] = n === 12 ? [[9, 2], [1, 2], [2, 1], [12, 1], [7, 2]] : [[10, 1], [5, 2], [8, 2]];
    const its = lista.map(([pn, cant]): PedidoItem => {
      const p = state.productos.find((x) => x.id === prodId(pn))!;
      return { id: uid(), pedido_id: pedido.id, producto_id: p.id, nombre: p.nombre, cantidad: cant, precio_unitario: p.precio_actual, costo_unitario: costoProducto(state, p.id), modificadores: [], notas: null, estacion: p.estacion, estado_cocina: "entregado", en_market_crash: false, persona: null, anulado_motivo: null, creado_at: iso(t), marchando_at: iso(t + min), listo_at: iso(t + 9 * min), entregado_at: iso(t + 11 * min), preparado_por: null };
    });
    pedido.subtotal = its.reduce((a, i) => a + importeItem(i), 0);
    pedido.total = pedido.subtotal;
    state.pedidos.push(pedido);
    state.items.push(...its);
    state.mesas = state.mesas.map((m) => (m.numero === n ? { ...m, estado: est, ocupada_desde: iso(t), mozo_id: pedido.mozo_id } : m));
  }
  state.mesas = state.mesas.map((m) => (m.numero === 10 || m.numero === 17 ? { ...m, estado: "reservada" } : m));

  // ---- 4. Delivery activo
  const dirs: [string, number, number, "en_camino" | "preparando" | "listo"][] = [
    ["Belgrano 1240", -27.7769, -64.2551, "en_camino"],
    ["Av. Libertad 560", -27.7921, -64.2588, "preparando"],
    ["Mitre 88", -27.7861, -64.2731, "listo"],
  ];
  const cadetes = USUARIOS.filter((u) => u.rol === "cadete");
  dirs.forEach(([dir, lat, lng, est], i) => {
    const t = ahora - (18 - i * 5) * min;
    const p = state.productos.find((x) => x.id === prodId([9, 10, 12][i]))!;
    const pedido: Pedido = { id: uid(), numero: 318 + i, tipo: "delivery", estado: est === "preparando" ? "confirmado" : "listo", mesa_id: null, mozo_id: null, cliente_nombre: ["Ana Torres", "Jorge Ibarra", "Paula Díaz"][i], cliente_telefono: "+54 385 4" + (100000 + i * 3711), direccion: dir, subtotal: 0, descuento: 0, propina: 0, total: 0, pagado: 0, en_market_crash: false, idempotency_key: `seed-del-${i}`, created_at: iso(t), cerrado_at: null };
    const it: PedidoItem = { id: uid(), pedido_id: pedido.id, producto_id: p.id, nombre: p.nombre, cantidad: 2, precio_unitario: p.precio_actual, costo_unitario: costoProducto(state, p.id), modificadores: [], notas: null, estacion: p.estacion, estado_cocina: est === "preparando" ? "marchando" : est === "listo" ? "listo" : "entregado", en_market_crash: false, persona: null, anulado_motivo: null, creado_at: iso(t), marchando_at: iso(t + min), listo_at: est === "preparando" ? null : iso(t + 10 * min), entregado_at: null, preparado_por: null };
    pedido.subtotal = importeItem(it); pedido.total = pedido.subtotal; pedido.pagado = pedido.total;
    state.pedidos.push(pedido); state.items.push(it);
    state.envios.push({ id: uid(), pedido_id: pedido.id, cadete_id: i === 0 ? cadetes[0].id : i === 2 ? cadetes[1].id : null, estado: est, direccion: dir, lat_destino: lat, lng_destino: lng, latitud_actual: est === "en_camino" ? -27.7810 : null, longitud_actual: est === "en_camino" ? -64.2600 : null, velocidad_kmh: est === "en_camino" ? 24 : null, ultima_actualizacion: est === "en_camino" ? iso(ahora) : null, tracking_token: `trk${318 + i}`, salida_at: est === "en_camino" ? iso(ahora - 4 * min) : null, entregado_at: null, created_at: iso(t) });
  });

  // ---- 5. Social: eventos, promos, fotos, cupones
  const dia = (d: number, h: number, m = 0) => { const x = new Date(ahora); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return iso(x.getTime()); };
  state.eventos = [
    { id: uid(), titulo: "DJ Nahuel", subtitulo: "Deep house", descripcion: "Set de 4 horas en la terraza. Entrada libre hasta las 00:30.", flyer_url: null, fecha: dia(2, 23), estado: "publicado" },
    { id: uid(), titulo: "Los del Río", subtitulo: "Rock en vivo", descripcion: "Banda en vivo con clásicos del rock nacional.", flyer_url: null, fecha: dia(3, 22, 30), estado: "publicado" },
    { id: uid(), titulo: "Noche de Tapas", subtitulo: "2×1 en picadas", descripcion: "Todas las tablas para compartir 2×1.", flyer_url: null, fecha: dia(8, 20), estado: "programado" },
    { id: uid(), titulo: "Trivia Night", subtitulo: "Premios en consumición", descripcion: "Equipos de hasta 6 personas.", flyer_url: null, fecha: dia(9, 21), estado: "borrador" },
  ];
  state.promociones = [
    { id: uid(), titulo: "Happy Hour · Tragos −20\u00a0%", tipo: "happy_hour", descuento_pct: 20, categoria_id: CATEGORIAS[0].id, dias: [1, 2, 3, 4], hora_desde: "19:00", hora_hasta: "21:00", activa: true },
    { id: uid(), titulo: "2×1 en cervezas", tipo: "2x1", descuento_pct: 50, categoria_id: CATEGORIAS[1].id, dias: [5], hora_desde: "18:00", hora_hasta: "20:00", activa: true },
    { id: uid(), titulo: "Combo parrilla", tipo: "combo", descuento_pct: 15, categoria_id: CATEGORIAS[3].id, dias: [6], hora_desde: "21:00", hora_hasta: "23:00", activa: false },
  ];
  const fotos: [mesa: number, icono: string, desc: string, votos: number, estado: FotoCliente["estado"], filtro: FotoCliente["filtro_auto"]][] = [
    [12, "burger", "La mejor burger de Santiago", 128, "aprobada", "ok"],
    [7, "pizza", "Pizza Napo con extra albahaca", 96, "aprobada", "ok"],
    [3, "mojito", "Mojitos para arrancar", 71, "aprobada", "ok"],
    [9, "salad", "Algo liviano", 44, "aprobada", "ok"],
    [14, "beer", "Pinta IPA bien fría", 0, "pendiente", "ok"],
    [2, "fries", "Papas cheddar recién salidas", 0, "pendiente", "revisar"],
    [11, "aperol", "Spritz time", 0, "pendiente", "pendiente"],
  ];
  state.fotos = fotos.map(([m, ic, d, v, e, f], i) => ({ id: uid(), mesa_id: mesaId(m), mesa_numero: m, url_foto: `icon:${ic}`, descripcion: d, sesion_cliente: `seed-ses-${i}`, estado: e, filtro_auto: f, codigo_voto: ["K7M2", "P4Q9", "Z1X8", "R5T3", "H2J6", "W9E4", "B3N7"][i], votos_count: v, es_ganadora: false, cupon_codigo: null, created_at: iso(ahora - (90 - i * 9) * min) }));
  state.cupones = [{ id: uid(), codigo: "BIENVENIDA10", descuento_pct: 10, origen: "manual", usos_max: 500, usos: 37, vence_at: iso(ahora + 60 * 86400_000), created_at: iso(ahora - 30 * 86400_000) }];

  // ---- 6. Reservas (hoy y mañana) y lista de espera
  const hoy = (h: number, m = 0) => { const x = new Date(ahora); x.setHours(h, m, 0, 0); if (x.getTime() < ahora - 5 * 3600_000) x.setDate(x.getDate() + 1); return iso(x.getTime()); };
  state.reservas = [
    ["Gómez", 2, 1, hoy(19, 30), 90], ["Pérez", 4, 4, hoy(19), 150], ["Sosa", 3, 4, hoy(21, 30), 90], ["Ruiz", 6, 6, hoy(20, 30), 150],
    ["Cumple Mica", 8, 10, hoy(20), 180], ["López", 2, 13, hoy(21, 30), 90], ["Díaz", 4, 15, hoy(21), 120], ["Fernández", 6, 17, hoy(22), 150],
  ].map(([nombre, personas, mesa, inicio, dur]) => ({ id: uid(), mesa_id: mesaId(mesa as number), nombre: nombre as string, telefono: "+54 385 4" + String(Math.floor(rand() * 900000 + 100000)), personas: personas as number, inicio: inicio as string, duracion_min: dur as number, estado: "confirmada" as const, notas: null }));
  state.espera = [{ id: uid(), nombre: "Torres", personas: 2, desde: iso(ahora - 8 * min) }, { id: uid(), nombre: "Ibarra", personas: 5, desde: iso(ahora - 3 * min) }];

  // ---- 7. Logs y mermas
  state.logs = [
    { id: uid(), nivel: "info", origen: "backup", mensaje: "Backup incremental OK · 214 MB (verificado)", created_at: iso(ahora - 48 * min) },
    { id: uid(), nivel: "info", origen: "caja", mensaje: "Caja 2: cierre parcial por Martín G.", created_at: iso(ahora - 15 * min) },
    { id: uid(), nivel: "warn", origen: "realtime", mensaje: "Reconexión del canal bar-central:barra (1,2 s)", created_at: iso(ahora - 33 * min) },
    { id: uid(), nivel: "error", origen: "facturacion", mensaje: "ARCA timeout (reintento automático OK)", created_at: iso(ahora - 61 * min) },
    { id: uid(), nivel: "info", origen: "exchange", mensaje: "Exchange: Mojito $4.100 → $4.250 (regla demanda)", created_at: iso(ahora - 2 * min) },
  ];
  state.mermas = [
    { id: uid(), insumo_id: INSUMOS.find((i) => i.nombre === "Limón")!.id, cantidad: 9, motivo: "vencimiento", created_at: iso(ahora - 100 * min) },
    { id: uid(), insumo_id: INSUMOS.find((i) => i.nombre === "Menta fresca")!.id, cantidad: 180, motivo: "vencimiento", created_at: iso(ahora - 140 * min) },
  ];

  state.pedidos.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return state;
}
