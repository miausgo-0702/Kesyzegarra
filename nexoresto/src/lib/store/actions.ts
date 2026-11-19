// Acciones del sistema y su reductor para el MODO DEMO.
// En producción las mismas acciones se traducen a RPCs de Supabase
// (ver supabaseBackend.ts) y la base de datos es la fuente de verdad.
import type {
  Bar, Producto, Rol, EstadoCocina, EstadoMesa, EstadoReserva, Estacion, Evento, IaRecomendacion, MedioPago,
  ModificadorElegido, NexoState, Pedido, PedidoItem, Promocion, ReglasPrecios, TipoPedido,
} from "../types";
import { crashActivo, evaluarMercado, triggerMarketCrash, variacion, type VentaRegistro } from "../exchangeEngine";
import { costoProducto, costosMap, esperadoTurno, extrasItem, importeItem } from "./selectors";
import { CATEGORIAS as CAT_EJEMPLO, INSUMOS as INS_EJEMPLO, MODIFICADORES as MOD_EJEMPLO, PRODUCTOS as PROD_EJEMPLO, RECETAS as REC_EJEMPLO } from "./catalogo";

export interface ItemNuevo {
  producto_id: string;
  cantidad: number;
  modificadores?: ModificadorElegido[];
  notas?: string | null;
  persona?: number | null;
  precio_visto?: number;   // precio que vio el cliente al agregarlo al carrito (se cobra ese)
}

export type Accion =
  | { type: "crearPedido"; tipo: TipoPedido; mesa_id: string | null; items: ItemNuevo[]; idempotency_key: string; mozo_id?: string | null; cliente?: { nombre?: string; telefono?: string; direccion?: string; lat?: number; lng?: number }; sesion_cliente?: string | null }
  | { type: "itemEstado"; item_id: string; estado: EstadoCocina; motivo?: string; usuario?: string }
  | { type: "despacharComanda"; pedido_id: string; estacion: Estacion; usuario?: string }
  | { type: "entregarPedido"; pedido_id: string }
  | { type: "mesaEstado"; mesa_id: string; estado: EstadoMesa; mozo_id?: string | null }
  | { type: "abrirTurno"; caja_nombre: string; fondo_inicial: number; cajero_id: string | null }
  | { type: "cerrarTurno"; turno_id: string; declarado: Partial<Record<MedioPago, number>>; usuario?: string }
  | { type: "registrarPago"; pedido_ids: string[]; turno_id: string; pagos: { medio: MedioPago; monto: number }[]; propina: number; idempotency_key: string; cupon?: string | null; usuario?: string }
  | { type: "marketCrash"; ids: string[]; mensaje: string; minutos: number; descuento_pct: number | null; usuario?: string }
  | { type: "finalizarCrash" }
  | { type: "exchangeTick"; ventanaMs?: number }
  | { type: "revertirPrecio"; producto_id: string; usuario?: string }
  | { type: "subirFoto"; mesa_id: string | null; url_foto: string; descripcion: string; sesion_cliente: string }
  | { type: "moderarFoto"; foto_id: string; estado: "aprobada" | "rechazada" }
  | { type: "votar"; foto_id: string; sesion_cliente: string }
  | { type: "cerrarVotacion"; descuento_pct: number; usuario?: string }
  | { type: "guardarEvento"; evento: Omit<Evento, "id"> & { id?: string } }
  | { type: "borrarEvento"; id: string }
  | { type: "guardarPromo"; promo: Omit<Promocion, "id"> & { id?: string } }
  | { type: "togglePromo"; id: string }
  | { type: "crearReserva"; nombre: string; telefono: string; personas: number; inicio: string; duracion_min: number; mesa_id: string | null; notas?: string }
  | { type: "reservaEstado"; id: string; estado: EstadoReserva }
  | { type: "agregarEspera"; nombre: string; personas: number }
  | { type: "quitarEspera"; id: string }
  | { type: "asignarCadete"; envio_id: string; cadete_id: string }
  | { type: "iniciarViaje"; envio_id: string; lat: number; lng: number }
  | { type: "gps"; envio_id: string; lat: number; lng: number; velocidad_kmh?: number | null }
  | { type: "entregarEnvio"; envio_id: string }
  | { type: "compraInsumo"; insumo_id: string; cantidad: number; costo_unitario: number; usuario?: string }
  | { type: "registrarMerma"; insumo_id: string; cantidad: number; motivo: "vencimiento" | "rotura" | "error" | "otro"; usuario?: string }
  | { type: "recomendacion"; id: string; estado: IaRecomendacion["estado"] }
  | { type: "nuevasRecomendaciones"; items: Omit<IaRecomendacion, "id" | "created_at" | "estado">[] }
  | { type: "notificacionLeida"; id: string }
  | { type: "actualizarReglas"; reglas: ReglasPrecios; usuario?: string }
  | { type: "guardarBar"; bar: Partial<Bar> & { id?: string; nombre: string; slug: string } }
  | { type: "licenciaBar"; bar_id: string; estado: Bar["estado_licencia"] }
  | { type: "toggleSimulacion" }
  | { type: "guardarProducto"; producto: Partial<Producto> & { nombre: string; categoria_id: string; precio_base: number }; receta?: { insumo_id: string; cantidad: number }[]; modificadores?: { grupo: string; nombre: string; precio_extra: number; exclusivo: boolean }[]; usuario?: string }
  | { type: "toggleAgotado"; producto_id: string; usuario?: string }
  | { type: "moverMesa"; origen_id: string; destino_id: string; usuario?: string }
  | { type: "guardarCategoria"; categoria: { id?: string; nombre: string; estacion: Estacion } }
  | { type: "borrarCategoria"; id: string }
  | { type: "moverCategoria"; id: string; delta: -1 | 1 }
  | { type: "archivarProducto"; id: string; archivar: boolean; usuario?: string }
  | { type: "duplicarProducto"; id: string }
  | { type: "guardarModificadores"; producto_id: string; items: { grupo: string; nombre: string; precio_extra: number; exclusivo: boolean }[] }
  | { type: "guardarSector"; sector: { id?: string; nombre: string } }
  | { type: "borrarSector"; id: string }
  | { type: "guardarMesa"; mesa: { id?: string; numero: number; capacidad: number; sector_id: string } }
  | { type: "borrarMesa"; id: string }
  | { type: "guardarUsuario"; usuario: { id?: string; nombre: string; rol: Rol; pin: string; activo: boolean } }
  | { type: "configurarBar"; datos: Partial<Pick<Bar, "nombre" | "direccion" | "propina_sugerida_pct" | "moneda" | "lat" | "lng">> }
  | { type: "importarCartaEjemplo" }
  | { type: "log"; nivel: "info" | "warn" | "error"; origen: string; mensaje: string };

export interface Ctx { now: number; uid: () => string }

const iso = (t: number) => new Date(t).toISOString();
const r2 = (n: number) => Math.round(n * 100) / 100;

function audit(s: NexoState, ctx: Ctx, a: Omit<NexoState["auditoria"][number], "id" | "created_at">) {
  s.auditoria = [{ id: ctx.uid(), created_at: iso(ctx.now), ...a }, ...s.auditoria].slice(0, 400);
}
function log(s: NexoState, ctx: Ctx, nivel: "info" | "warn" | "error", origen: string, mensaje: string) {
  s.logs = [{ id: ctx.uid(), nivel, origen, mensaje, created_at: iso(ctx.now) }, ...s.logs].slice(0, 300);
}
function notificar(s: NexoState, ctx: Ctx, n: Omit<NexoState["notificaciones"][number], "id" | "created_at" | "leida">) {
  s.notificaciones = [{ id: ctx.uid(), created_at: iso(ctx.now), leida: false, ...n }, ...s.notificaciones].slice(0, 80);
}
function pushHist(s: NexoState, pid: string, t: number, p: number) {
  const h = s.historial[pid] ?? [];
  s.historial[pid] = [...h, { t, p }].slice(-90);
}
function setPrecio(s: NexoState, pid: string, precio: number, t: number) {
  s.productos = s.productos.map((p) =>
    p.id !== pid ? p : { ...p, precio_anterior: p.precio_actual, precio_actual: precio, variacion_porcentaje: variacion(precio, p.precio_base) },
  );
  pushHist(s, pid, t, precio);
}

export function recalcularPedido(s: NexoState, pedidoId: string) {
  const sub = s.items.filter((i) => i.pedido_id === pedidoId).reduce((a, i) => a + importeItem(i), 0);
  s.pedidos = s.pedidos.map((p) => (p.id !== pedidoId ? p : { ...p, subtotal: sub, total: Math.max(sub - p.descuento, 0) + p.propina }));
}

function nombreMesa(s: NexoState, mesaId: string | null) {
  return mesaId ? s.mesas.find((m) => m.id === mesaId)?.numero ?? null : null;
}

/** Reductor: muta un borrador clonado y lo devuelve. Lanza Error con mensaje para la UI. */
export function reducir(prev: NexoState, a: Accion, ctx: Ctx): NexoState {
  const s: NexoState = { ...prev };
  const now = ctx.now;

  switch (a.type) {
    case "crearPedido": {
      if (s.pedidos.some((p) => p.idempotency_key === a.idempotency_key)) return prev; // idempotente
      if (!a.items.length) throw new Error("El pedido está vacío");
      const enCr = crashActivo(s.crash, now);
      const numero = Math.max(100, ...s.pedidos.map((p) => p.numero)) + 1;
      const pedido: Pedido = {
        id: ctx.uid(), numero, tipo: a.tipo, estado: "confirmado", mesa_id: a.mesa_id, mozo_id: a.mozo_id ?? null,
        cliente_nombre: a.cliente?.nombre ?? null, cliente_telefono: a.cliente?.telefono ?? null, direccion: a.cliente?.direccion ?? null,
        subtotal: 0, descuento: 0, propina: 0, total: 0, pagado: 0, en_market_crash: enCr, idempotency_key: a.idempotency_key,
        sesion_cliente: a.sesion_cliente ?? null, created_at: iso(now), cerrado_at: null,
      };
      const items: PedidoItem[] = a.items.map((it) => {
        const p = s.productos.find((x) => x.id === it.producto_id);
        if (!p || !p.activo) throw new Error("Producto no disponible");
        if (p.agotado) throw new Error(`${p.nombre} está agotado`);
        // Precio congelado: el vigente, o el que vio el cliente si es menor/igual y reciente (protege al cliente ante un cambio mientras pedía)
        const precio = it.precio_visto && it.precio_visto <= p.precio_actual ? it.precio_visto : p.precio_actual;
        return {
          id: ctx.uid(), pedido_id: pedido.id, producto_id: p.id, nombre: p.nombre, cantidad: Math.max(1, Math.round(it.cantidad)),
          precio_unitario: precio, costo_unitario: costoProducto(s, p.id), modificadores: it.modificadores ?? [], notas: it.notas ?? null,
          estacion: p.estacion, estado_cocina: "pendiente", en_market_crash: enCr && !!s.crash?.productos.includes(p.id),
          persona: it.persona ?? null, anulado_motivo: null, creado_at: iso(now), marchando_at: null, listo_at: null, entregado_at: null, preparado_por: null,
        };
      });
      s.pedidos = [pedido, ...s.pedidos];
      s.items = [...items, ...s.items];
      recalcularPedido(s, pedido.id);
      // Trigger de stock: descuenta insumos según receta (escandallo)
      const consumo = new Map<string, number>();
      for (const it of items) for (const r of s.recetas) if (r.producto_id === it.producto_id) consumo.set(r.insumo_id, (consumo.get(r.insumo_id) ?? 0) + r.cantidad * it.cantidad);
      s.insumos = s.insumos.map((i) => (consumo.has(i.id) ? { ...i, stock_actual: Math.round((i.stock_actual - consumo.get(i.id)!) * 1000) / 1000 } : i));
      if (a.mesa_id) s.mesas = s.mesas.map((m) => (m.id !== a.mesa_id ? m : { ...m, estado: "esperando", ocupada_desde: m.ocupada_desde ?? iso(now), mozo_id: m.mozo_id ?? a.mozo_id ?? null }));
      if (a.tipo === "delivery") {
        s.envios = [{
          id: ctx.uid(), pedido_id: pedido.id, cadete_id: null, estado: "preparando", direccion: a.cliente?.direccion ?? "",
          lat_destino: a.cliente?.lat ?? s.bar.lat + 0.012, lng_destino: a.cliente?.lng ?? s.bar.lng + 0.01,
          latitud_actual: null, longitud_actual: null, velocidad_kmh: null, ultima_actualizacion: null,
          tracking_token: ctx.uid().slice(0, 8), salida_at: null, entregado_at: null, created_at: iso(now),
        }, ...s.envios];
      }
      if (a.tipo === "webapp_qr") notificar(s, ctx, { para: "mozo", texto: `Nuevo pedido por QR`, mesa_numero: nombreMesa(s, a.mesa_id), pedido_id: pedido.id });
      return s;
    }

    case "itemEstado": {
      const it = s.items.find((i) => i.id === a.item_id);
      if (!it) return prev;
      if (a.estado === "anulado") {
        audit(s, ctx, { usuario: a.usuario ?? "—", accion: "anulacion_item", tipo: "operacion", detalle: `${it.cantidad}× ${it.nombre} · ${a.motivo ?? "sin motivo"}`, monto: importeItem(it) });
      }
      s.items = s.items.map((i) => i.id !== a.item_id ? i : {
        ...i, estado_cocina: a.estado, anulado_motivo: a.estado === "anulado" ? a.motivo ?? null : i.anulado_motivo,
        marchando_at: a.estado === "marchando" ? i.marchando_at ?? iso(now) : i.marchando_at,
        listo_at: a.estado === "listo" ? i.listo_at ?? iso(now) : a.estado === "pendiente" || a.estado === "marchando" ? null : i.listo_at,
        entregado_at: a.estado === "entregado" ? iso(now) : i.entregado_at,
        preparado_por: a.estado === "listo" || a.estado === "marchando" ? a.usuario ?? i.preparado_por : i.preparado_por,
      });
      recalcularPedido(s, it.pedido_id);
      return s;
    }

    case "despacharComanda": {
      const ped = s.pedidos.find((p) => p.id === a.pedido_id);
      if (!ped) return prev;
      s.items = s.items.map((i) => i.pedido_id === a.pedido_id && i.estacion === a.estacion && (i.estado_cocina === "pendiente" || i.estado_cocina === "marchando")
        ? { ...i, estado_cocina: "listo" as const, listo_at: iso(now), marchando_at: i.marchando_at ?? iso(now), preparado_por: a.usuario ?? null } : i)
        .map((i) => (i.pedido_id === a.pedido_id && i.estacion === a.estacion && !i.despachado_at && i.estado_cocina !== "anulado" ? { ...i, despachado_at: iso(now) } : i));
      const quedan = s.items.some((i) => i.pedido_id === a.pedido_id && (i.estado_cocina === "pendiente" || i.estado_cocina === "marchando"));
      if (!quedan) {
        s.pedidos = s.pedidos.map((p) => (p.id === a.pedido_id ? { ...p, estado: "listo" } : p));
        if (ped.mesa_id) s.mesas = s.mesas.map((m) => (m.id === ped.mesa_id && (m.estado === "esperando" || m.estado === "demorada") ? { ...m, estado: "ocupada" } : m));
        s.envios = s.envios.map((e) => (e.pedido_id === a.pedido_id && (e.estado === "pendiente" || e.estado === "preparando") ? { ...e, estado: "listo" } : e));
      }
      const mesa = nombreMesa(s, ped.mesa_id);
      notificar(s, ctx, {
        para: ped.tipo === "delivery" ? "caja" : "mozo",
        texto: `${a.estacion === "cocina" ? "Cocina" : "Barra"}: ${ped.tipo === "delivery" ? `delivery #D-${ped.numero}` : `mesa ${mesa ?? "mostrador"}`} lista para retirar`,
        mesa_numero: mesa, pedido_id: ped.id,
      });
      return s;
    }

    case "entregarPedido": {
      s.items = s.items.map((i) => (i.pedido_id === a.pedido_id && i.estado_cocina === "listo" ? { ...i, estado_cocina: "entregado", entregado_at: iso(now) } : i));
      s.pedidos = s.pedidos.map((p) => (p.id === a.pedido_id && p.estado === "listo" ? { ...p, estado: "entregado" } : p));
      s.notificaciones = s.notificaciones.map((n) => (n.pedido_id === a.pedido_id ? { ...n, leida: true } : n));
      return s;
    }

    case "mesaEstado": {
      s.mesas = s.mesas.map((m) => m.id !== a.mesa_id ? m : {
        ...m, estado: a.estado, mozo_id: a.mozo_id !== undefined ? a.mozo_id : m.mozo_id,
        ocupada_desde: a.estado === "libre" ? null : m.ocupada_desde ?? iso(now),
      });
      if (a.estado === "cuenta_pedida") notificar(s, ctx, { para: "caja", texto: `Mesa ${nombreMesa(s, a.mesa_id)} pidió la cuenta`, mesa_numero: nombreMesa(s, a.mesa_id), pedido_id: null });
      return s;
    }

    case "abrirTurno": {
      if (s.turnos.some((t) => t.estado === "abierto" && t.caja_nombre === a.caja_nombre)) throw new Error("Ya hay un turno abierto en esta caja");
      const id = ctx.uid();
      s.turnos = [{ id, caja_nombre: a.caja_nombre, cajero_id: a.cajero_id, estado: "abierto", fondo_inicial: a.fondo_inicial, apertura_at: iso(now), cierre_at: null, declarado: null, esperado: null, diferencia_total: null }, ...s.turnos];
      audit(s, ctx, { usuario: s.usuarios.find((u) => u.id === a.cajero_id)?.nombre ?? "—", accion: "apertura_caja", tipo: "caja", detalle: `${a.caja_nombre} · fondo inicial`, monto: a.fondo_inicial });
      return s;
    }

    case "cerrarTurno": {
      const t = s.turnos.find((x) => x.id === a.turno_id);
      if (!t || t.estado !== "abierto") throw new Error("El turno no está abierto");
      const abiertas = s.pedidos.filter((p) => p.tipo === "salon" && p.estado !== "cerrado" && p.estado !== "anulado");
      if (abiertas.length) throw new Error(`No se puede cerrar: hay ${abiertas.length} pedido(s) de salón sin cobrar`);
      const esperado = esperadoTurno(s, t.id);
      const dif = (Object.keys(esperado) as (keyof typeof esperado)[]).reduce((acc, k) => acc + ((a.declarado[k] ?? 0) - esperado[k]), 0);
      s.turnos = s.turnos.map((x) => (x.id === t.id ? { ...x, estado: "cerrado", cierre_at: iso(now), declarado: a.declarado, esperado, diferencia_total: r2(dif) } : x));
      audit(s, ctx, { usuario: a.usuario ?? "—", accion: "cierre_caja", tipo: "caja", detalle: `${t.caja_nombre} · diferencia de arqueo`, monto: r2(dif) });
      return s;
    }

    case "registrarPago": {
      if (s.movimientos.some((m) => m.idempotency_key === `${a.idempotency_key}:0`)) return prev; // no hay doble cobro
      const turno = s.turnos.find((t) => t.id === a.turno_id && t.estado === "abierto");
      if (!turno) throw new Error("Abrí un turno de caja para cobrar");
      const peds = s.pedidos.filter((p) => a.pedido_ids.includes(p.id));
      if (!peds.length) throw new Error("No hay nada para cobrar");
      let descuento = 0;
      if (a.cupon) {
        const c = s.cupones.find((x) => x.codigo === a.cupon!.toUpperCase().trim());
        if (!c || c.usos >= c.usos_max || (c.vence_at && new Date(c.vence_at).getTime() < now)) throw new Error("Cupón inválido o vencido");
        const sub = peds.reduce((acc, p) => acc + p.subtotal, 0);
        descuento = Math.round((sub * c.descuento_pct) / 100);
        s.cupones = s.cupones.map((x) => (x.id === c.id ? { ...x, usos: x.usos + 1 } : x));
        audit(s, ctx, { usuario: a.usuario ?? "—", accion: "descuento", tipo: "caja", detalle: `Cupón ${c.codigo} (${c.descuento_pct} %)`, monto: descuento });
      }
      const movs = a.pagos.filter((p) => p.monto > 0).map((p, i) => ({ id: ctx.uid(), turno_id: turno.id, pedido_id: peds[0].id, tipo: "cobro" as const, medio: p.medio, monto: r2(p.monto), idempotency_key: `${a.idempotency_key}:${i}`, created_at: iso(now) }));
      if (a.propina > 0) movs.push({ id: ctx.uid(), turno_id: turno.id, pedido_id: peds[0].id, tipo: "propina" as never, medio: a.pagos[0]?.medio ?? "efectivo", monto: r2(a.propina), idempotency_key: `${a.idempotency_key}:propina`, created_at: iso(now) });
      s.movimientos = [...movs, ...s.movimientos];
      let restante = a.pagos.reduce((acc, p) => acc + p.monto, 0);
      let descRest = descuento;
      // Los pagos (sin propina) se aplican pedido por pedido; la propina se registra aparte en el primero.
      s.pedidos = s.pedidos.map((p) => {
        if (!a.pedido_ids.includes(p.id)) return p;
        const d = Math.min(descRest, p.subtotal); descRest -= d;
        const propina = p.id === peds[0].id ? a.propina : p.propina;
        const total = Math.max(p.subtotal - p.descuento - d, 0) + propina;
        const aplicar = Math.min(restante + (p.id === peds[0].id ? a.propina : 0), Math.max(total - p.pagado, 0));
        restante = Math.max(restante - Math.max(aplicar - (p.id === peds[0].id ? a.propina : 0), 0), 0);
        const pagado = r2(p.pagado + aplicar);
        const cerrado = pagado >= total - 0.5;
        return { ...p, descuento: p.descuento + d, propina, total, pagado, estado: cerrado ? "cerrado" : p.estado, cerrado_at: cerrado ? iso(now) : p.cerrado_at };
      });
      // liberar mesas sin pedidos abiertos
      const mesas = new Set(peds.map((p) => p.mesa_id).filter(Boolean) as string[]);
      s.mesas = s.mesas.map((m) => mesas.has(m.id) && !s.pedidos.some((p) => p.mesa_id === m.id && p.estado !== "cerrado" && p.estado !== "anulado")
        ? { ...m, estado: "libre", mozo_id: null, ocupada_desde: null } : m);
      return s;
    }

    case "marketCrash": {
      if (crashActivo(s.crash, now)) throw new Error("Ya hay un Market Crash activo");
      const { crash, precios } = triggerMarketCrash({ productos: s.productos, ids: a.ids, mensaje: a.mensaje, minutos: a.minutos, descuento_pct: a.descuento_pct, usuario_id: a.usuario ?? null, ahora: now, reglas: s.bar.reglas_precios, id: ctx.uid() });
      if (!crash.productos.length) throw new Error("Elegí al menos un producto cotizable");
      for (const [pid, precio] of Object.entries(precios)) setPrecio(s, pid, precio, now);
      s.crash = crash;
      s.crashes = [crash, ...s.crashes].slice(0, 30);
      audit(s, ctx, { usuario: a.usuario ?? "—", accion: "market_crash", tipo: "precio", detalle: `${crash.productos.length} productos · ${a.minutos} min · "${crash.mensaje}"` });
      log(s, ctx, "info", "exchange", `Market Crash activado (${a.minutos} min)`);
      return s;
    }

    case "finalizarCrash": {
      if (!s.crash || s.crash.finalizado) return prev;
      for (const [pid, precio] of Object.entries(s.crash.precios_previos)) setPrecio(s, pid, precio, now);
      const fin = { ...s.crash, finalizado: true, fin_at: iso(Math.min(now, new Date(s.crash.fin_at).getTime())) };
      s.crash = null;
      s.crashes = s.crashes.map((c) => (c.id === fin.id ? fin : c));
      log(s, ctx, "info", "exchange", "Market Crash finalizado: precios restaurados");
      return s;
    }

    case "exchangeTick": {
      if (s.crash && !crashActivo(s.crash, now)) {
        // vence el crash → restaurar antes de recalcular
        return reducir(reducir(prev, { type: "finalizarCrash" }, ctx), { type: "exchangeTick", ventanaMs: a.ventanaMs }, ctx);
      }
      const ventanaMs = a.ventanaMs ?? s.bar.reglas_precios.ventana_min * 60_000;
      const ventas: VentaRegistro[] = s.items.filter((i) => i.estado_cocina !== "anulado").map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad, ts: new Date(i.creado_at).getTime() }));
      const cambios = evaluarMercado({ productos: s.productos, ventas, costos: costosMap(s), reglas: s.bar.reglas_precios, ahora: now, ventanaMs, crash: s.crash });
      for (const c of cambios) {
        if (c.precio_nuevo !== c.precio_anterior) setPrecio(s, c.producto_id, c.precio_nuevo, now);
        else pushHist(s, c.producto_id, now, c.precio_nuevo);
        if (c.motivo === "tope") {
          const p = s.productos.find((x) => x.id === c.producto_id);
          if (p && c.precio_anterior !== c.precio_nuevo) log(s, ctx, "warn", "exchange", `${p.nombre} alcanzó el tope ($${c.precio_nuevo})`);
        }
      }
      const n = cambios.filter((c) => c.precio_nuevo !== c.precio_anterior).length;
      if (n) {
        const top = cambios.filter((c) => c.precio_nuevo !== c.precio_anterior).slice(0, 2).map((c) => `${s.productos.find((p) => p.id === c.producto_id)?.nombre} $${c.precio_anterior}→$${c.precio_nuevo}`).join(", ");
        log(s, ctx, "info", "exchange", `Tick: ${n} precios actualizados (${top}${n > 2 ? "…" : ""})`);
      }
      s.ultimo_tick = now;
      return s;
    }

    case "revertirPrecio": {
      const p = s.productos.find((x) => x.id === a.producto_id);
      if (!p) return prev;
      setPrecio(s, p.id, p.precio_base, now);
      audit(s, ctx, { usuario: a.usuario ?? "—", accion: "cambio_precio", tipo: "precio", detalle: `${p.nombre} revertido a precio base`, monto: p.precio_base });
      return s;
    }

    case "subirFoto": {
      const deHoy = s.fotos.filter((f) => f.sesion_cliente === a.sesion_cliente && now - new Date(f.created_at).getTime() < 12 * 3600_000);
      if (deHoy.length >= 3) throw new Error("Máximo 3 fotos por noche");
      const codigo = ctx.uid().replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase();
      s.fotos = [{
        id: ctx.uid(), mesa_id: a.mesa_id, mesa_numero: nombreMesa(s, a.mesa_id), url_foto: a.url_foto, descripcion: a.descripcion.slice(0, 140),
        sesion_cliente: a.sesion_cliente, estado: "pendiente", filtro_auto: a.url_foto.startsWith("data:") ? "ok" : "revisar",
        codigo_voto: codigo, votos_count: 0, es_ganadora: false, cupon_codigo: null, created_at: iso(now),
      }, ...s.fotos];
      return s;
    }

    case "moderarFoto": {
      s.fotos = s.fotos.map((f) => (f.id === a.foto_id ? { ...f, estado: a.estado } : f));
      return s;
    }

    case "votar": {
      const f = s.fotos.find((x) => x.id === a.foto_id && x.estado === "aprobada");
      if (!f) throw new Error("Foto no disponible");
      if (f.sesion_cliente === a.sesion_cliente) throw new Error("No podés votar tu propia foto");
      if (s.votos.some((v) => v.sesion_cliente === a.sesion_cliente)) throw new Error("Ya usaste tu voto de esta ronda");
      s.votos = [...s.votos, { foto_id: f.id, sesion_cliente: a.sesion_cliente, created_at: iso(now) }];
      s.fotos = s.fotos.map((x) => (x.id === f.id ? { ...x, votos_count: x.votos_count + 1 } : x));
      return s;
    }

    case "cerrarVotacion": {
      const cand = s.fotos.filter((f) => f.estado === "aprobada" && !f.es_ganadora).sort((x, y) => y.votos_count - x.votos_count || x.created_at.localeCompare(y.created_at))[0];
      if (!cand) throw new Error("No hay fotos aprobadas para premiar");
      const codigo = `FOTO-${ctx.uid().replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase()}`;
      s.cupones = [{ id: ctx.uid(), codigo, descuento_pct: a.descuento_pct, origen: "foto_ganadora", usos_max: 1, usos: 0, vence_at: iso(now + 30 * 86400_000), created_at: iso(now) }, ...s.cupones];
      s.fotos = s.fotos.map((f) => (f.id === cand.id ? { ...f, es_ganadora: true, cupon_codigo: codigo } : f));
      s.votos = []; // nueva ronda
      audit(s, ctx, { usuario: a.usuario ?? "—", accion: "cierre_votacion", tipo: "operacion", detalle: `Ganadora mesa ${cand.mesa_numero ?? "—"} (${cand.votos_count} votos) · ${codigo}` });
      return s;
    }

    case "guardarEvento": {
      const ev = { ...a.evento, id: a.evento.id ?? ctx.uid() } as Evento;
      s.eventos = [...s.eventos.filter((e) => e.id !== ev.id), ev].sort((x, y) => x.fecha.localeCompare(y.fecha));
      return s;
    }
    case "borrarEvento": s.eventos = s.eventos.filter((e) => e.id !== a.id); return s;
    case "guardarPromo": {
      const pr = { ...a.promo, id: a.promo.id ?? ctx.uid() } as Promocion;
      s.promociones = [...s.promociones.filter((p) => p.id !== pr.id), pr];
      return s;
    }
    case "togglePromo": s.promociones = s.promociones.map((p) => (p.id === a.id ? { ...p, activa: !p.activa } : p)); return s;

    case "crearReserva": {
      if (a.mesa_id) {
        const ini = new Date(a.inicio).getTime(), fin = ini + a.duracion_min * 60_000;
        const choca = s.reservas.some((r) => r.mesa_id === a.mesa_id && ["pendiente", "confirmada", "sentada"].includes(r.estado)
          && new Date(r.inicio).getTime() < fin && ini < new Date(r.inicio).getTime() + r.duracion_min * 60_000);
        if (choca) throw new Error("La mesa ya tiene una reserva superpuesta en esa franja");
      }
      s.reservas = [...s.reservas, { id: ctx.uid(), mesa_id: a.mesa_id, nombre: a.nombre, telefono: a.telefono, personas: a.personas, inicio: a.inicio, duracion_min: a.duracion_min, estado: "confirmada", notas: a.notas ?? null }];
      return s;
    }
    case "reservaEstado": {
      const r = s.reservas.find((x) => x.id === a.id);
      s.reservas = s.reservas.map((x) => (x.id === a.id ? { ...x, estado: a.estado } : x));
      if (r?.mesa_id && a.estado === "sentada") s.mesas = s.mesas.map((m) => (m.id === r.mesa_id ? { ...m, estado: "ocupada", ocupada_desde: iso(now) } : m));
      return s;
    }
    case "agregarEspera": s.espera = [...s.espera, { id: ctx.uid(), nombre: a.nombre, personas: a.personas, desde: iso(now) }]; return s;
    case "quitarEspera": s.espera = s.espera.filter((e) => e.id !== a.id); return s;

    case "asignarCadete": s.envios = s.envios.map((e) => (e.id === a.envio_id ? { ...e, cadete_id: a.cadete_id } : e)); return s;
    case "iniciarViaje": {
      s.envios = s.envios.map((e) => (e.id === a.envio_id ? { ...e, estado: "en_camino", salida_at: iso(now), latitud_actual: a.lat, longitud_actual: a.lng, ultima_actualizacion: iso(now) } : e));
      const e = s.envios.find((x) => x.id === a.envio_id);
      if (e) s.items = s.items.map((i) => (i.pedido_id === e.pedido_id && i.estado_cocina === "listo" ? { ...i, estado_cocina: "entregado", entregado_at: iso(now) } : i));
      return s;
    }
    case "gps": s.envios = s.envios.map((e) => (e.id === a.envio_id && e.estado === "en_camino" ? { ...e, latitud_actual: a.lat, longitud_actual: a.lng, velocidad_kmh: a.velocidad_kmh ?? e.velocidad_kmh, ultima_actualizacion: iso(now) } : e)); return s;
    case "entregarEnvio": {
      const e = s.envios.find((x) => x.id === a.envio_id);
      s.envios = s.envios.map((x) => (x.id === a.envio_id ? { ...x, estado: "entregado", entregado_at: iso(now), latitud_actual: x.lat_destino, longitud_actual: x.lng_destino } : x));
      if (e) s.pedidos = s.pedidos.map((p) => (p.id === e.pedido_id ? { ...p, estado: p.pagado >= p.total ? "cerrado" : "entregado", cerrado_at: p.pagado >= p.total ? iso(now) : p.cerrado_at } : p));
      return s;
    }

    case "compraInsumo": {
      const i = s.insumos.find((x) => x.id === a.insumo_id);
      if (!i || a.cantidad <= 0) throw new Error("Datos de compra inválidos");
      // costo promedio ponderado
      const stockPos = Math.max(i.stock_actual, 0);
      const nuevoCosto = (stockPos * i.costo_unitario + a.cantidad * a.costo_unitario) / (stockPos + a.cantidad);
      s.insumos = s.insumos.map((x) => (x.id === i.id ? { ...x, stock_actual: x.stock_actual + a.cantidad, costo_unitario: Math.round(nuevoCosto * 100) / 100 } : x));
      s.compras = [{ id: ctx.uid(), insumo_id: i.id, cantidad: a.cantidad, costo_unitario: a.costo_unitario, proveedor: i.proveedor, created_at: iso(now) }, ...s.compras];
      audit(s, ctx, { usuario: a.usuario ?? "—", accion: "compra", tipo: "operacion", detalle: `${a.cantidad} ${i.unidad} de ${i.nombre} · ${i.proveedor}`, monto: Math.round(a.cantidad * a.costo_unitario) });
      return s;
    }
    case "registrarMerma": {
      const i = s.insumos.find((x) => x.id === a.insumo_id);
      if (!i || a.cantidad <= 0) throw new Error("Datos de merma inválidos");
      s.insumos = s.insumos.map((x) => (x.id === i.id ? { ...x, stock_actual: x.stock_actual - a.cantidad } : x));
      s.mermas = [{ id: ctx.uid(), insumo_id: i.id, cantidad: a.cantidad, motivo: a.motivo, created_at: iso(now) }, ...s.mermas];
      audit(s, ctx, { usuario: a.usuario ?? "—", accion: "merma", tipo: "operacion", detalle: `${a.cantidad} ${i.unidad} de ${i.nombre} · ${a.motivo}`, monto: Math.round(a.cantidad * i.costo_unitario) });
      return s;
    }

    case "recomendacion": s.recomendaciones = s.recomendaciones.map((r) => (r.id === a.id ? { ...r, estado: a.estado } : r)); return s;
    case "nuevasRecomendaciones": {
      const pendientesTit = new Set(s.recomendaciones.filter((r) => r.estado === "pendiente").map((r) => r.titulo));
      const nuevas = a.items.filter((r) => !pendientesTit.has(r.titulo)).map((r) => ({ ...r, id: ctx.uid(), estado: "pendiente" as const, created_at: iso(now) }));
      s.recomendaciones = [...nuevas, ...s.recomendaciones.map((r) => (r.estado === "pendiente" && !a.items.some((x) => x.titulo === r.titulo) ? { ...r, estado: "expirada" as const } : r))].slice(0, 60);
      return s;
    }
    case "notificacionLeida": s.notificaciones = s.notificaciones.map((n) => (n.id === a.id ? { ...n, leida: true } : n)); return s;

    case "actualizarReglas": {
      s.bar = { ...s.bar, reglas_precios: a.reglas };
      s.bares = s.bares.map((b) => (b.id === s.bar.id ? s.bar : b));
      audit(s, ctx, { usuario: a.usuario ?? "—", accion: "reglas_exchange", tipo: "precio", detalle: `Ventana ${a.reglas.ventana_min} min · paso ${a.reglas.paso_pct_por_unidad}%/u · máx ±${a.reglas.paso_max_pct}%` });
      log(s, ctx, "info", "superadmin", "Reglas del motor Exchange actualizadas (versión guardada)");
      return s;
    }
    case "guardarCategoria": {
      const c = a.categoria;
      if (!c.nombre.trim()) throw new Error("La categoría necesita un nombre");
      if (s.categorias.some((x) => x.nombre.toLowerCase() === c.nombre.trim().toLowerCase() && x.id !== c.id)) throw new Error("Ya existe una categoría con ese nombre");
      if (c.id) {
        s.categorias = s.categorias.map((x) => (x.id === c.id ? { ...x, nombre: c.nombre.trim(), estacion: c.estacion } : x));
        // los productos siguen a la estación de su categoría (cocina o barra)
        s.productos = s.productos.map((p) => (p.categoria_id === c.id ? { ...p, estacion: c.estacion } : p));
      } else {
        s.categorias = [...s.categorias, { id: ctx.uid(), nombre: c.nombre.trim(), estacion: c.estacion, orden: Math.max(0, ...s.categorias.map((x) => x.orden)) + 1 }];
      }
      return s;
    }
    case "borrarCategoria": {
      if (s.productos.some((p) => p.categoria_id === a.id && p.activo)) throw new Error("Mové o archivá sus productos antes de borrar la categoría");
      s.categorias = s.categorias.filter((c) => c.id !== a.id);
      return s;
    }
    case "moverCategoria": {
      const orden = [...s.categorias].sort((x, y) => x.orden - y.orden);
      const i = orden.findIndex((c) => c.id === a.id), j = i + a.delta;
      if (i < 0 || j < 0 || j >= orden.length) return prev;
      [orden[i], orden[j]] = [orden[j], orden[i]];
      s.categorias = orden.map((c, k) => ({ ...c, orden: k + 1 }));
      return s;
    }
    case "archivarProducto": {
      const p = s.productos.find((x) => x.id === a.id);
      if (!p) return prev;
      s.productos = s.productos.map((x) => (x.id === a.id ? { ...x, activo: !a.archivar } : x));
      audit(s, ctx, { usuario: a.usuario ?? "—", accion: "carta", tipo: "operacion", detalle: `${p.nombre} ${a.archivar ? "archivado" : "restaurado"}` });
      return s;
    }
    case "duplicarProducto": {
      const p = s.productos.find((x) => x.id === a.id);
      if (!p) return prev;
      const id = ctx.uid();
      s.productos = [...s.productos, { ...p, id, nombre: `${p.nombre} (copia)`, destacado: false, precio_actual: p.precio_base, precio_anterior: null, variacion_porcentaje: 0 }];
      s.recetas = [...s.recetas, ...s.recetas.filter((r) => r.producto_id === p.id).map((r) => ({ ...r, producto_id: id }))];
      s.modificadores = [...s.modificadores, ...s.modificadores.filter((m) => m.producto_id === p.id).map((m) => ({ ...m, id: ctx.uid(), producto_id: id }))];
      s.historial = { ...s.historial, [id]: [{ t: now, p: p.precio_base }] };
      return s;
    }
    case "guardarModificadores": {
      const limpios = a.items.filter((m) => m.nombre.trim() && m.grupo.trim());
      s.modificadores = [...s.modificadores.filter((m) => m.producto_id !== a.producto_id),
        ...limpios.map((m) => ({ id: ctx.uid(), producto_id: a.producto_id, categoria_id: null, grupo: m.grupo.trim(), nombre: m.nombre.trim(), precio_extra: Math.max(0, Math.round(m.precio_extra) || 0), exclusivo: m.exclusivo }))];
      return s;
    }
    case "guardarSector": {
      if (!a.sector.nombre.trim()) throw new Error("El sector necesita un nombre");
      s.sectores = a.sector.id ? s.sectores.map((x) => (x.id === a.sector.id ? { ...x, nombre: a.sector.nombre.trim() } : x))
        : [...s.sectores, { id: ctx.uid(), nombre: a.sector.nombre.trim(), orden: s.sectores.length + 1 }];
      return s;
    }
    case "borrarSector": {
      if (s.mesas.some((m) => m.sector_id === a.id)) throw new Error("El sector todavía tiene mesas");
      s.sectores = s.sectores.filter((x) => x.id !== a.id);
      return s;
    }
    case "guardarMesa": {
      const m = a.mesa;
      if (!(m.numero > 0)) throw new Error("Número de mesa inválido");
      if (s.mesas.some((x) => x.numero === m.numero && x.id !== m.id)) throw new Error(`Ya existe la mesa ${m.numero}`);
      if (!(m.capacidad > 0)) throw new Error("La capacidad debe ser mayor a cero");
      s.mesas = m.id ? s.mesas.map((x) => (x.id === m.id ? { ...x, numero: m.numero, capacidad: m.capacidad, sector_id: m.sector_id } : x))
        : [...s.mesas, { id: ctx.uid(), numero: m.numero, capacidad: m.capacidad, sector_id: m.sector_id, estado: "libre" as const, mozo_id: null, ocupada_desde: null, qr_token: ctx.uid().replace(/-/g, "").slice(0, 12) }].sort((x, y) => x.numero - y.numero);
      return s;
    }
    case "borrarMesa": {
      if (s.pedidos.some((p) => p.mesa_id === a.id && p.estado !== "cerrado" && p.estado !== "anulado")) throw new Error("La mesa tiene pedidos abiertos");
      s.mesas = s.mesas.filter((x) => x.id !== a.id);
      return s;
    }
    case "guardarUsuario": {
      const u = a.usuario;
      if (!u.nombre.trim()) throw new Error("Falta el nombre");
      if (!/^\d{4}$/.test(u.pin)) throw new Error("El PIN debe tener 4 dígitos");
      if (s.usuarios.some((x) => x.pin === u.pin && x.id !== u.id && x.activo)) throw new Error("Ese PIN ya lo usa otra persona del equipo");
      s.usuarios = u.id ? s.usuarios.map((x) => (x.id === u.id ? { ...x, nombre: u.nombre.trim(), rol: u.rol, pin: u.pin, activo: u.activo } : x))
        : [...s.usuarios, { id: ctx.uid(), bar_id: s.bar.id, nombre: u.nombre.trim(), rol: u.rol, pin: u.pin, activo: u.activo }];
      return s;
    }
    case "configurarBar": {
      const d = a.datos;
      if (d.nombre !== undefined && !d.nombre.trim()) throw new Error("El bar necesita un nombre");
      if (d.propina_sugerida_pct !== undefined && (d.propina_sugerida_pct < 0 || d.propina_sugerida_pct > 30)) throw new Error("La propina sugerida va de 0 a 30 %");
      s.bar = { ...s.bar, ...d };
      s.bares = s.bares.map((b) => (b.id === s.bar.id ? { ...b, ...d } : b));
      return s;
    }
    case "importarCartaEjemplo": {
      const m = new Map<string, string>();
      const nid = (id: string) => { if (!m.has(id)) m.set(id, ctx.uid()); return m.get(id)!; };
      const cats = CAT_EJEMPLO.map((c) => ({ ...c, id: nid(c.id), orden: c.orden + s.categorias.length }));
      s.categorias = [...s.categorias, ...cats.filter((c) => !s.categorias.some((x) => x.nombre === c.nombre))];
      const catPorNombre = (id: string) => { const nombre = CAT_EJEMPLO.find((c) => c.id === id)!.nombre; return s.categorias.find((c) => c.nombre === nombre)!.id; };
      s.productos = [...s.productos, ...PROD_EJEMPLO.map((p) => ({ ...p, id: nid(p.id), categoria_id: catPorNombre(p.categoria_id) }))];
      s.insumos = [...s.insumos, ...INS_EJEMPLO.filter((i) => !s.insumos.some((x) => x.nombre === i.nombre)).map((i) => ({ ...i, id: nid(i.id) }))];
      const insId = (id: string) => { const n = INS_EJEMPLO.find((i) => i.id === id)!.nombre; return s.insumos.find((x) => x.nombre === n)!.id; };
      s.recetas = [...s.recetas, ...REC_EJEMPLO.map((r) => ({ ...r, producto_id: nid(r.producto_id), insumo_id: insId(r.insumo_id) }))];
      s.modificadores = [...s.modificadores, ...MOD_EJEMPLO.map((x) => ({ ...x, id: ctx.uid(), producto_id: x.producto_id ? nid(x.producto_id) : null, categoria_id: x.categoria_id ? catPorNombre(x.categoria_id) : null }))];
      for (const p of PROD_EJEMPLO) s.historial = { ...s.historial, [nid(p.id)]: [{ t: now, p: p.precio_base }] };
      return s;
    }

    case "guardarBar": {
      if (!/^[a-z0-9-]{3,40}$/.test(a.bar.slug)) throw new Error("Slug inválido (minúsculas, números y guiones)");
      if (s.bares.some((b) => b.slug === a.bar.slug && b.id !== a.bar.id)) throw new Error("Ese slug ya existe");
      if (a.bar.id) { s.bares = s.bares.map((b) => (b.id === a.bar.id ? { ...b, ...a.bar } as Bar : b)); if (a.bar.id === s.bar.id) s.bar = { ...s.bar, ...a.bar } as Bar; }
      else s.bares = [...s.bares, { ...s.bar, id: ctx.uid(), usuarios: 0, estado_licencia: "prueba", plan: "basico", created_at: iso(now), licencia_vence: iso(now + 14 * 86400_000), ...a.bar } as Bar];
      log(s, ctx, "info", "superadmin", `Bar ${a.bar.nombre} ${a.bar.id ? "actualizado" : "creado"}`);
      return s;
    }
    case "licenciaBar": {
      s.bares = s.bares.map((b) => (b.id === a.bar_id ? { ...b, estado_licencia: a.estado } : b));
      if (s.bar.id === a.bar_id) s.bar = { ...s.bar, estado_licencia: a.estado };
      log(s, ctx, a.estado === "suspendida" ? "warn" : "info", "licencias", `Licencia ${a.estado}: ${s.bares.find((b) => b.id === a.bar_id)?.nombre}`);
      return s;
    }
    case "toggleSimulacion": s.simulacion = !s.simulacion; return s;

    case "guardarProducto": {
      const d = a.producto;
      if (!d.nombre.trim()) throw new Error("El producto necesita un nombre");
      if (!(d.precio_base > 0)) throw new Error("El precio base debe ser mayor a cero");
      const r50 = (n: number) => Math.round(n / 50) * 50;
      const cat = s.categorias.find((c) => c.id === d.categoria_id);
      const existente = d.id ? s.productos.find((p) => p.id === d.id) : undefined;
      const cotiza = d.es_cotizable_bolsa ?? existente?.es_cotizable_bolsa ?? true;
      const minimo = cotiza ? d.precio_minimo ?? r50(d.precio_base * 0.75) : d.precio_base;
      const maximo = cotiza ? d.precio_maximo ?? r50(d.precio_base * (1 + s.bar.reglas_precios.tope_pct / 100)) : d.precio_base;
      if (minimo > d.precio_base || maximo < d.precio_base) throw new Error("El precio base tiene que quedar entre el mínimo y el máximo");
      const base: Producto = existente ?? {
        id: ctx.uid(), categoria_id: d.categoria_id, nombre: d.nombre, descripcion: "", icono: "burger", estacion: cat?.estacion ?? "cocina",
        precio_base: d.precio_base, precio_minimo: minimo, precio_maximo: maximo, precio_actual: d.precio_base, precio_anterior: null,
        variacion_porcentaje: 0, es_cotizable_bolsa: cotiza, objetivo_ventana: 2, tiempo_objetivo_min: 10, destacado: false, activo: true, agotado: false,
      };
      const actual = Math.min(Math.max(existente ? existente.precio_actual : d.precio_base, minimo), maximo);
      const nuevo: Producto = { ...base, ...d, estacion: cat?.estacion ?? base.estacion, precio_minimo: minimo, precio_maximo: maximo, es_cotizable_bolsa: cotiza,
        precio_actual: cotiza ? actual : d.precio_base, variacion_porcentaje: variacion(cotiza ? actual : d.precio_base, d.precio_base) } as Producto;
      s.productos = existente ? s.productos.map((p) => (p.id === nuevo.id ? nuevo : p)) : [...s.productos, nuevo];
      if (!existente) s.historial = { ...s.historial, [nuevo.id]: [{ t: now, p: nuevo.precio_actual }] };
      if (a.receta) s.recetas = [...s.recetas.filter((r) => r.producto_id !== nuevo.id), ...a.receta.filter((r) => r.cantidad > 0).map((r) => ({ ...r, producto_id: nuevo.id }))];
      if (a.modificadores) s.modificadores = [...s.modificadores.filter((m) => m.producto_id !== nuevo.id),
        ...a.modificadores.filter((m) => m.nombre.trim() && m.grupo.trim()).map((m) => ({ id: ctx.uid(), producto_id: nuevo.id, categoria_id: null, grupo: m.grupo.trim(), nombre: m.nombre.trim(), precio_extra: Math.max(0, Math.round(m.precio_extra) || 0), exclusivo: m.exclusivo }))];
      audit(s, ctx, { usuario: a.usuario ?? "—", accion: "cambio_precio", tipo: "precio", detalle: `${existente ? "Editado" : "Nuevo"}: ${nuevo.nombre} · base ${nuevo.precio_base}, rango ${minimo}–${maximo}`, monto: nuevo.precio_base });
      return s;
    }
    case "toggleAgotado": {
      const p = s.productos.find((x) => x.id === a.producto_id);
      if (!p) return prev;
      s.productos = s.productos.map((x) => (x.id === p.id ? { ...x, agotado: !x.agotado } : x));
      audit(s, ctx, { usuario: a.usuario ?? "—", accion: "agotado", tipo: "operacion", detalle: `${p.nombre} ${p.agotado ? "vuelve a la venta" : "marcado agotado (86)"}` });
      return s;
    }
    case "moverMesa": {
      if (a.origen_id === a.destino_id) return prev;
      const origen = s.mesas.find((m) => m.id === a.origen_id), destino = s.mesas.find((m) => m.id === a.destino_id);
      if (!origen || !destino) throw new Error("Mesa inexistente");
      const abiertos = s.pedidos.filter((p) => p.mesa_id === origen.id && p.estado !== "cerrado" && p.estado !== "anulado");
      if (!abiertos.length) throw new Error("La mesa de origen no tiene pedidos abiertos");
      const ids = new Set(abiertos.map((p) => p.id));
      s.pedidos = s.pedidos.map((p) => (ids.has(p.id) ? { ...p, mesa_id: destino.id } : p));
      const uniendo = destino.estado !== "libre" && destino.estado !== "reservada";
      s.mesas = s.mesas.map((m) => m.id === origen.id ? { ...m, estado: "libre", mozo_id: null, ocupada_desde: null }
        : m.id === destino.id ? { ...m, estado: uniendo ? m.estado : origen.estado, mozo_id: m.mozo_id ?? origen.mozo_id, ocupada_desde: m.ocupada_desde ?? origen.ocupada_desde } : m);
      audit(s, ctx, { usuario: a.usuario ?? "—", accion: "mover_mesa", tipo: "operacion", detalle: `${uniendo ? "Unió" : "Movió"} mesa ${origen.numero} → mesa ${destino.numero} (${abiertos.length} pedido${abiertos.length > 1 ? "s" : ""})` });
      return s;
    }
    case "log": log(s, ctx, a.nivel, a.origen, a.mensaje); return s;
  }
}

export const precioConExtras = (precio: number, mods: ModificadorElegido[] = []) => precio + extrasItem({ modificadores: mods });
