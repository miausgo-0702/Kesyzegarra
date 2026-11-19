/* eslint-disable @typescript-eslint/no-explicit-any */
// Backend de PRODUCCIÓN sobre Supabase.
//  · Lectura: snapshot del bar (tablas para el personal, vistas públicas para TV/QR)
//  · Tiempo real: un canal por bar; ante cualquier cambio se refresca (con debounce)
//  · Escritura: SIEMPRE por RPC (lógica crítica validada en Postgres)
import type { Backend } from "./backend";
import type { Accion } from "./actions";
import type { NexoState, PuntoPrecio } from "../types";
import { supabaseBrowser } from "../supabase/client";
import { REGLAS_DEFAULT } from "../exchangeEngine";
import { STATE_VERSION } from "./seed";

const vacio = (): Omit<NexoState, "bar"> => ({
  version: STATE_VERSION, bares: [], usuarios: [], categorias: [], productos: [], modificadores: [], insumos: [], recetas: [],
  sectores: [], mesas: [], pedidos: [], items: [], turnos: [], movimientos: [], cupones: [], historial: {}, crash: null, crashes: [],
  envios: [], eventos: [], promociones: [], fotos: [], votos: [], reservas: [], espera: [], auditoria: [], logs: [], compras: [], mermas: [],
  recomendaciones: [], notificaciones: [], ultimo_tick: Date.now(), simulacion: false,
});

const num = (v: any) => (v == null ? v : Number(v));

export class SupabaseBackend implements Backend {
  modo = "supabase" as const;
  private sb = supabaseBrowser();
  private state: NexoState | null = null;
  private listeners = new Set<() => void>();
  private barId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() { void this.iniciar(); }

  private slugDeUrl() {
    const m = window.location.pathname.match(/^\/(?:tv|menu)\/([a-z0-9-]+)/);
    return m?.[1] ?? process.env.NEXT_PUBLIC_DEFAULT_BAR_SLUG ?? "bar-central";
  }

  private async iniciar() {
    const { data: auth } = await this.sb.auth.getUser();
    if (auth.user) {
      const { data: perfil } = await this.sb.from("perfiles_usuarios").select("bar_id").eq("id", auth.user.id).maybeSingle();
      this.barId = perfil?.bar_id ?? null;
    }
    if (!this.barId) {
      const { data } = await this.sb.from("v_bares_publicos").select("id").eq("slug", this.slugDeUrl()).maybeSingle();
      this.barId = data?.id ?? null;
    }
    if (!this.barId) { console.error("Nexoresto: bar no encontrado"); return; }
    await this.refrescar();
    window.addEventListener("online", () => void this.vaciarCola());
    void this.vaciarCola();
    this.sb.channel(`bar:${this.barId}`)
      .on("postgres_changes", { event: "*", schema: "public", filter: `bar_id=eq.${this.barId}` }, () => this.programarRefresco())
      .subscribe();
    // Respaldo ante cortes de websocket
    setInterval(() => this.refrescar(), 30_000);
  }

  private programarRefresco() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refrescar(), 250);
  }

  private async q(tabla: string, cols = "*", opts?: { orden?: string; limite?: number; desde?: string }) {
    let qb: any = this.sb.from(tabla).select(cols).eq("bar_id", this.barId);
    if (opts?.desde) qb = qb.gte("created_at", opts.desde);
    if (opts?.orden) qb = qb.order(opts.orden, { ascending: false });
    if (opts?.limite) qb = qb.limit(opts.limite);
    const { data, error } = await qb;
    return error ? [] : (data as any[]);
  }

  private async refrescar() {
    const desde = new Date(Date.now() - 36 * 3600_000).toISOString();
    const [bar, cats, prods, mods, ins, rec, sect, mesas, peds, items, turnos, movs, cupones, hist, crashes, envios, eventos, promos, fotos, reservas, audit, perfiles] = await Promise.all([
      this.sb.from("bares").select("*").eq("id", this.barId).maybeSingle().then((r: any) => r.data),
      this.q("categorias"),
      this.q("productos").then(async (r) => (r.length ? r : (await this.sb.from("v_carta_publica").select("*").eq("bar_id", this.barId)).data ?? [])),
      this.q("modificadores"),
      this.q("insumos", "*, proveedores(nombre)"),
      this.q("recetas"),
      this.q("sectores"),
      this.q("mesas"),
      this.q("pedidos", "*", { desde, orden: "created_at" }),
      this.sb.from("pedido_items").select("*").eq("bar_id", this.barId).gte("creado_at", desde).then((r: any) => r.data ?? []),
      this.q("turnos_caja", "*", { orden: "apertura_at", limite: 20 }),
      this.q("movimientos_caja", "*", { desde }),
      this.q("cupones_descuento"),
      this.sb.from("v_historial_publico").select("*").eq("bar_id", this.barId).order("created_at").then((r: any) => r.data ?? []),
      this.sb.from("market_crashes").select("*").eq("bar_id", this.barId).order("inicio_at", { ascending: false }).limit(20).then((r: any) => r.data ?? []),
      this.q("envios_delivery"),
      this.q("eventos", "*", { orden: "fecha" }),
      this.q("promociones"),
      this.sb.from("fotos_clientes").select("*").eq("bar_id", this.barId).gte("created_at", desde).then(async (r: any) => r.data?.length ? r.data : (await this.sb.from("v_fotos_publicas").select("*").eq("bar_id", this.barId)).data ?? []),
      this.q("reservas"),
      this.q("auditoria", "*", { orden: "created_at", limite: 200 }),
      this.q("perfiles_usuarios", "id, bar_id, nombre, rol, activo"),
    ]);

    const historial: Record<string, PuntoPrecio[]> = {};
    for (const h of hist) (historial[h.producto_id] ??= []).push({ t: new Date(h.created_at).getTime(), p: Number(h.precio) });
    const mesaNum = new Map((mesas as any[]).map((m) => [m.id, m.numero]));
    const nombre = new Map((perfiles as any[]).map((p) => [p.id, p.nombre]));
    const crash = (crashes as any[]).find((c) => !c.finalizado && new Date(c.fin_at).getTime() > Date.now()) ?? null;

    this.state = {
      ...vacio(),
      bar: bar ? { ...bar, reglas_precios: { ...REGLAS_DEFAULT, ...bar.reglas_precios }, lat: bar.lat ?? -34.6, lng: bar.lng ?? -58.4 } : (this.state?.bar as any),
      bares: bar ? [bar] : [],
      usuarios: (perfiles as any[]).map((p) => ({ ...p, pin: "" })),
      categorias: cats,
      productos: (prods as any[]).map((p) => ({ ...p, precio_base: num(p.precio_base), precio_minimo: num(p.precio_minimo ?? p.precio_actual), precio_maximo: num(p.precio_maximo ?? p.precio_actual), precio_actual: num(p.precio_actual), precio_anterior: num(p.precio_anterior), variacion_porcentaje: num(p.variacion_porcentaje), activo: p.activo ?? true, objetivo_ventana: p.objetivo_ventana ?? 6, tiempo_objetivo_min: p.tiempo_objetivo_min ?? 12 })),
      modificadores: (mods as any[]).map((m) => ({ ...m, precio_extra: num(m.precio_extra) })),
      insumos: (ins as any[]).map((i) => ({ ...i, stock_actual: num(i.stock_actual), stock_minimo: num(i.stock_minimo), costo_unitario: num(i.costo_unitario), proveedor: i.proveedores?.nombre ?? "—" })),
      recetas: (rec as any[]).map((r) => ({ ...r, cantidad: num(r.cantidad) })),
      sectores: sect, mesas,
      pedidos: (peds as any[]).map((p) => ({ ...p, subtotal: num(p.subtotal), descuento: num(p.descuento), propina: num(p.propina), total: num(p.total), pagado: num(p.pagado) })),
      items: (items as any[]).map((i) => ({ ...i, precio_unitario: num(i.precio_unitario), costo_unitario: num(i.costo_unitario) })),
      turnos: turnos, movimientos: (movs as any[]).map((m) => ({ ...m, monto: num(m.monto) })),
      cupones: (cupones as any[]).map((c) => ({ ...c, descuento_pct: num(c.descuento_pct) })),
      historial, crash, crashes,
      envios, eventos, promociones: promos,
      fotos: (fotos as any[]).map((f) => ({ ...f, mesa_numero: mesaNum.get(f.mesa_id) ?? null, cupon_codigo: null, estado: f.estado ?? "aprobada", sesion_cliente: f.sesion_cliente ?? "" })),
      reservas,
      auditoria: (audit as any[]).map((a) => ({ id: String(a.id), usuario: nombre.get(a.usuario_id) ?? "—", accion: a.accion, tipo: a.tipo, detalle: typeof a.detalle === "string" ? a.detalle : Object.entries(a.detalle ?? {}).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · "), monto: num(a.detalle?.monto ?? a.detalle?.importe ?? a.detalle?.diferencia ?? null), created_at: a.created_at })),
    } as NexoState;
    this.listeners.forEach((l) => l());
  }

  getState() { return this.state; }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  private async rpc(fn: string, args: Record<string, unknown>) {
    const { error } = await this.sb.rpc(fn, args);
    if (error) throw new Error(error.message);
    this.programarRefresco();
  }

  // ---------------------------------------------------------------------------
  // Cola offline: si no hay conexión, las acciones idempotentes se guardan en el
  // dispositivo y se envían en orden al volver internet. La clave idempotente de
  // pedidos y pagos garantiza que un reintento nunca duplique nada.
  // ---------------------------------------------------------------------------
  private static COLA = "nexoresto:cola-offline";
  private static ENCOLABLES = new Set<Accion["type"]>(["crearPedido", "registrarPago", "itemEstado", "despacharComanda", "entregarPedido", "mesaEstado", "gps", "votar"]);
  private enviando = false;

  private leerCola(): Accion[] { try { return JSON.parse(localStorage.getItem(SupabaseBackend.COLA) ?? "[]"); } catch { return []; } }
  private escribirCola(c: Accion[]) { localStorage.setItem(SupabaseBackend.COLA, JSON.stringify(c)); window.dispatchEvent(new Event("nexoresto:cola")); }
  pendientes() { return this.leerCola().length; }

  async vaciarCola() {
    if (this.enviando || !navigator.onLine) return;
    this.enviando = true;
    try {
      let cola = this.leerCola();
      while (cola.length) {
        try { await this.ejecutar(cola[0]); } catch (e) {
          if (e instanceof TypeError) break;        // sigue sin red: reintenta luego
          console.error("Acción descartada de la cola:", e); // error de negocio: no se reintenta
        }
        cola = cola.slice(1);
        this.escribirCola(cola);
      }
    } finally { this.enviando = false; }
  }

  async dispatch(a: Accion) {
    if (SupabaseBackend.ENCOLABLES.has(a.type)) {
      if (!navigator.onLine) { this.escribirCola([...this.leerCola(), a]); return; }
      try { return await this.ejecutar(a); } catch (e) {
        if (e instanceof TypeError) { this.escribirCola([...this.leerCola(), a]); return; } // falla de red
        throw e;
      }
    }
    return this.ejecutar(a);
  }

  private async ejecutar(a: Accion) {
    const bar = this.barId;
    switch (a.type) {
      case "crearPedido":
        return this.rpc("crear_pedido", { p_bar: bar, p_tipo: a.tipo, p_mesa: a.mesa_id, p_items: a.items, p_idempotency_key: a.idempotency_key, p_cliente: a.cliente ?? {} });
      case "itemEstado": return this.rpc("cambiar_estado_item", { p_item: a.item_id, p_estado: a.estado, p_motivo: a.motivo ?? null });
      case "despacharComanda": return this.rpc("despachar_comanda", { p_pedido: a.pedido_id, p_estacion: a.estacion });
      case "abrirTurno": return this.rpc("abrir_turno", { p_bar: bar, p_caja: a.caja_nombre, p_fondo: a.fondo_inicial });
      case "cerrarTurno": return this.rpc("cerrar_turno", { p_turno: a.turno_id, p_declarado: a.declarado });
      case "registrarPago":
        for (const [i, pid] of a.pedido_ids.entries()) {
          await this.rpc("registrar_pago", { p_pedido: pid, p_turno: a.turno_id, p_pagos: i === 0 ? a.pagos : [], p_propina: i === 0 ? a.propina : 0, p_idempotency_key: `${a.idempotency_key}-${i}`, p_cupon: i === 0 ? a.cupon ?? null : null });
        }
        return;
      case "marketCrash": return this.rpc("lanzar_market_crash", { p_bar: bar, p_productos: a.ids, p_mensaje: a.mensaje, p_minutos: a.minutos, p_descuento_pct: a.descuento_pct });
      case "finalizarCrash": if (this.state?.crash) return this.rpc("finalizar_market_crash", { p_crash: this.state.crash.id }); return;
      case "votar": return this.rpc("votar_foto", { p_foto: a.foto_id, p_sesion: a.sesion_cliente });
      case "cerrarVotacion": return this.rpc("cerrar_votacion", { p_bar: bar, p_descuento: a.descuento_pct });
      case "gps": return this.rpc("actualizar_gps", { p_envio: a.envio_id, p_lat: a.lat, p_lng: a.lng, p_vel: a.velocidad_kmh ?? null });
      case "subirFoto": {
        const mesa = this.state?.mesas.find((m) => m.id === a.mesa_id);
        let url = a.url_foto;
        if (url.startsWith("data:")) {
          const blob = await (await fetch(url)).blob();
          const path = `${bar}/${crypto.randomUUID()}.jpg`;
          const up = await this.sb.storage.from("fotos-clientes").upload(path, blob, { contentType: "image/jpeg" });
          if (up.error) throw new Error(up.error.message);
          url = this.sb.storage.from("fotos-clientes").getPublicUrl(path).data.publicUrl;
        }
        return this.rpc("subir_foto_cliente", { p_bar: bar, p_mesa_token: mesa?.qr_token, p_url: url, p_descripcion: a.descripcion, p_sesion: a.sesion_cliente });
      }
      default:
        return this.tabla(a);
    }
  }

  /** Acciones simples de gestión: escritura directa en tablas protegidas por RLS. */
  private async tabla(a: Accion) {
    const bar = this.barId;
    const run = async (p: PromiseLike<{ error: any }>) => { const { error } = await p; if (error) throw new Error(error.message); this.programarRefresco(); };
    switch (a.type) {
      case "mesaEstado": return run(this.sb.from("mesas").update({ estado: a.estado, ...(a.mozo_id !== undefined ? { mozo_id: a.mozo_id } : {}) }).eq("id", a.mesa_id));
      case "entregarPedido": return run(this.sb.from("pedido_items").update({ estado_cocina: "entregado" }).eq("pedido_id", a.pedido_id).eq("estado_cocina", "listo"));
      case "moderarFoto": return run(this.sb.from("fotos_clientes").update({ estado: a.estado }).eq("id", a.foto_id));
      case "guardarEvento": return run(this.sb.from("eventos").upsert({ ...a.evento, bar_id: bar }));
      case "borrarEvento": return run(this.sb.from("eventos").delete().eq("id", a.id));
      case "guardarPromo": return run(this.sb.from("promociones").upsert({ ...a.promo, bar_id: bar }));
      case "togglePromo": { const p = this.state?.promociones.find((x) => x.id === a.id); return run(this.sb.from("promociones").update({ activa: !p?.activa }).eq("id", a.id)); }
      case "crearReserva": return run(this.sb.from("reservas").insert({ bar_id: bar, mesa_id: a.mesa_id, nombre: a.nombre, telefono: a.telefono, personas: a.personas, inicio: a.inicio, duracion_min: a.duracion_min, notas: a.notas ?? null, estado: "confirmada" }));
      case "reservaEstado": return run(this.sb.from("reservas").update({ estado: a.estado }).eq("id", a.id));
      case "asignarCadete": return run(this.sb.from("envios_delivery").update({ cadete_id: a.cadete_id }).eq("id", a.envio_id));
      case "iniciarViaje": return run(this.sb.from("envios_delivery").update({ estado: "en_camino", salida_at: new Date().toISOString(), latitud_actual: a.lat, longitud_actual: a.lng, ultima_actualizacion: new Date().toISOString() }).eq("id", a.envio_id));
      case "entregarEnvio": return run(this.sb.from("envios_delivery").update({ estado: "entregado", entregado_at: new Date().toISOString() }).eq("id", a.envio_id));
      case "compraInsumo": {
        const i = this.state?.insumos.find((x) => x.id === a.insumo_id);
        await run(this.sb.from("movimientos_stock").insert({ bar_id: bar, insumo_id: a.insumo_id, tipo: "compra", cantidad: a.cantidad, costo_unitario: a.costo_unitario }));
        return run(this.sb.from("insumos").update({ stock_actual: (i?.stock_actual ?? 0) + a.cantidad }).eq("id", a.insumo_id));
      }
      case "registrarMerma": {
        const i = this.state?.insumos.find((x) => x.id === a.insumo_id);
        await run(this.sb.from("movimientos_stock").insert({ bar_id: bar, insumo_id: a.insumo_id, tipo: "merma", cantidad: -a.cantidad, motivo: a.motivo }));
        return run(this.sb.from("insumos").update({ stock_actual: (i?.stock_actual ?? 0) - a.cantidad }).eq("id", a.insumo_id));
      }
      case "actualizarReglas":
        await run(this.sb.from("exchange_reglas_historial").insert({ bar_id: bar, reglas: a.reglas }));
        return run(this.sb.from("bares").update({ reglas_precios: a.reglas }).eq("id", bar));
      case "guardarBar": return run(this.sb.from("bares").upsert(a.bar));
      case "licenciaBar": return run(this.sb.from("bares").update({ estado_licencia: a.estado }).eq("id", a.bar_id));
      case "toggleAgotado": { const p = this.state?.productos.find((x) => x.id === a.producto_id); return this.rpc("marcar_agotado", { p_producto: a.producto_id, p_agotado: !p?.agotado }); }
      case "moverMesa": return this.rpc("mover_mesa", { p_origen: a.origen_id, p_destino: a.destino_id });
      case "guardarProducto": {
        const { id, ...datos } = a.producto;
        const fila = { ...datos, bar_id: bar, ...(id ? { id } : {}) };
        const { data, error } = await this.sb.from("productos").upsert(fila).select("id").single();
        if (error) throw new Error(error.message);
        if (a.receta) {
          await this.sb.from("recetas").delete().eq("producto_id", data.id);
          if (a.receta.length) await run(this.sb.from("recetas").insert(a.receta.map((r) => ({ ...r, bar_id: bar, producto_id: data.id }))));
        }
        if (a.modificadores) {
          await this.sb.from("modificadores").delete().eq("producto_id", data.id);
          if (a.modificadores.length) await run(this.sb.from("modificadores").insert(a.modificadores.map((m) => ({ ...m, bar_id: bar, producto_id: data.id }))));
        }
        this.programarRefresco();
        return;
      }
      case "guardarCategoria": return run(this.sb.from("categorias").upsert({ ...(a.categoria.id ? { id: a.categoria.id } : { orden: (this.state?.categorias.length ?? 0) + 1 }), bar_id: bar, nombre: a.categoria.nombre, estacion: a.categoria.estacion }));
      case "borrarCategoria": return run(this.sb.from("categorias").delete().eq("id", a.id));
      case "moverCategoria": {
        const orden = [...(this.state?.categorias ?? [])].sort((x, y) => x.orden - y.orden);
        const i = orden.findIndex((c) => c.id === a.id), j = i + a.delta;
        if (i < 0 || j < 0 || j >= orden.length) return;
        await run(this.sb.from("categorias").update({ orden: orden[j].orden }).eq("id", orden[i].id));
        return run(this.sb.from("categorias").update({ orden: orden[i].orden }).eq("id", orden[j].id));
      }
      case "archivarProducto": return run(this.sb.from("productos").update({ activo: !a.archivar }).eq("id", a.id));
      case "duplicarProducto": {
        const p = this.state?.productos.find((x) => x.id === a.id);
        if (!p) return;
        const { id: _omit, precio_anterior: _pa, variacion_porcentaje: _v, ...resto } = p; void _omit; void _pa; void _v;
        return run(this.sb.from("productos").insert({ ...resto, bar_id: bar, nombre: `${p.nombre} (copia)`, destacado: false }));
      }
      case "guardarModificadores":
        await this.sb.from("modificadores").delete().eq("producto_id", a.producto_id);
        return a.items.length ? run(this.sb.from("modificadores").insert(a.items.map((m) => ({ ...m, bar_id: bar, producto_id: a.producto_id })))) : undefined;
      case "guardarSector": return run(this.sb.from("sectores").upsert({ ...(a.sector.id ? { id: a.sector.id } : {}), bar_id: bar, nombre: a.sector.nombre }));
      case "borrarSector": return run(this.sb.from("sectores").delete().eq("id", a.id));
      case "guardarMesa": return run(this.sb.from("mesas").upsert({ ...(a.mesa.id ? { id: a.mesa.id } : {}), bar_id: bar, numero: a.mesa.numero, capacidad: a.mesa.capacidad, sector_id: a.mesa.sector_id }));
      case "borrarMesa": return run(this.sb.from("mesas").delete().eq("id", a.id));
      case "configurarBar": return run(this.sb.from("bares").update(a.datos).eq("id", bar));
      case "guardarUsuario":
        // Las cuentas de acceso se crean en Supabase Auth; acá se actualiza el perfil y el PIN (hash en el servidor).
        if (!a.usuario.id) throw new Error("Creá la cuenta en Supabase → Authentication y después asignale rol y PIN acá");
        await run(this.sb.from("perfiles_usuarios").update({ nombre: a.usuario.nombre, rol: a.usuario.rol, activo: a.usuario.activo }).eq("id", a.usuario.id));
        return this.rpc("fijar_pin", { p_usuario: a.usuario.id, p_pin: a.usuario.pin });
      case "revertirPrecio": { const p = this.state?.productos.find((x) => x.id === a.producto_id); return run(this.sb.from("productos").update({ precio_actual: p?.precio_base }).eq("id", a.producto_id)); }
      default:
        // exchangeTick (lo corre pg_cron / Vercel Cron), simulación y notificaciones locales no aplican en producción
        return;
    }
  }
}
