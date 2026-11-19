// Tipos del dominio. Los nombres de campos son IDÉNTICOS a las columnas SQL
// (supabase/migrations/0001_nucleo.sql) para que el adaptador de Supabase y el
// modo demo compartan la misma forma de datos.

export type Rol =
  | "super_admin" | "jefe" | "caja" | "mozo" | "cocina" | "bartender" | "pantalla_tv" | "cm" | "cadete";

export type Estacion = "cocina" | "barra";
export type EstadoMesa = "libre" | "ocupada" | "esperando" | "cuenta_pedida" | "reservada" | "demorada";
export type TipoPedido = "salon" | "mostrador" | "delivery" | "webapp_qr";
export type EstadoPedido = "borrador" | "confirmado" | "en_preparacion" | "listo" | "entregado" | "cerrado" | "anulado";
export type EstadoCocina = "pendiente" | "marchando" | "listo" | "entregado" | "anulado";
export type MedioPago = "efectivo" | "debito" | "credito" | "qr" | "transferencia" | "cupon";
export type EstadoEnvio = "pendiente" | "preparando" | "listo" | "en_camino" | "entregado" | "cancelado";
export type EstadoFoto = "pendiente" | "aprobada" | "rechazada";
export type EstadoReserva = "pendiente" | "confirmada" | "sentada" | "no_show" | "cancelada";

export interface ReglasPrecios {
  ventana_min: number;          // ventana de cálculo (producción: 15)
  objetivo_default: number;
  paso_pct_por_unidad: number;  // % por unidad de exceso
  paso_max_pct: number;         // tope del paso por ventana
  redondeo: number;             // redondeo a $50
  margen_piso: number;          // piso = costo × 1,35
  tope_pct: number;             // tope = base + 40 %
  crash_duracion_min: number;
}

export interface Bar {
  id: string;
  slug: string;
  nombre: string;
  moneda: string;
  reglas_precios: ReglasPrecios;
  propina_sugerida_pct: number;
  plan: "basico" | "pro" | "enterprise";
  estado_licencia: "activa" | "prueba" | "suspendida";
  licencia_vence?: string | null;
  lat: number;
  lng: number;
  direccion: string;
  usuarios?: number;
  created_at: string;
}

export interface Usuario {
  id: string;
  bar_id: string | null;
  nombre: string;
  rol: Rol;
  pin: string;         // SOLO modo demo. En Supabase se guarda pin_hash (bcrypt).
  activo: boolean;
}

export interface Categoria {
  id: string;
  nombre: string;
  orden: number;
  estacion: Estacion;
}

export interface Modificador {
  id: string;
  producto_id: string | null;
  categoria_id: string | null;
  grupo: string;
  nombre: string;
  precio_extra: number;
  exclusivo: boolean;
}

export interface ModificadorElegido {
  grupo: string;
  nombre: string;
  precio_extra: number;
}

export interface Producto {
  id: string;
  categoria_id: string;
  nombre: string;
  descripcion: string;
  icono: string;
  estacion: Estacion;
  precio_base: number;
  precio_minimo: number;
  precio_maximo: number;
  precio_actual: number;
  precio_anterior: number | null;
  variacion_porcentaje: number;
  es_cotizable_bolsa: boolean;
  objetivo_ventana: number;
  tiempo_objetivo_min: number;
  destacado: boolean;
  activo: boolean;
}

export interface Insumo {
  id: string;
  nombre: string;
  rubro: string;
  unidad: string;
  stock_actual: number;
  stock_minimo: number;
  costo_unitario: number;
  proveedor: string;
  vence_el?: string | null;
}

export interface RecetaItem {
  producto_id: string;
  insumo_id: string;
  cantidad: number;
}

export interface Sector { id: string; nombre: string; orden: number }

export interface Mesa {
  id: string;
  sector_id: string;
  numero: number;
  capacidad: number;
  estado: EstadoMesa;
  mozo_id: string | null;
  ocupada_desde: string | null;
  qr_token: string;
}

export interface Pedido {
  id: string;
  numero: number;
  tipo: TipoPedido;
  estado: EstadoPedido;
  mesa_id: string | null;
  mozo_id: string | null;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  direccion: string | null;
  subtotal: number;
  descuento: number;
  propina: number;
  total: number;
  pagado: number;
  en_market_crash: boolean;
  idempotency_key: string;
  sesion_cliente?: string | null;
  created_at: string;
  cerrado_at: string | null;
}

export interface PedidoItem {
  id: string;
  pedido_id: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  costo_unitario: number;
  modificadores: ModificadorElegido[];
  notas: string | null;
  estacion: Estacion;
  estado_cocina: EstadoCocina;
  en_market_crash: boolean;
  persona: number | null;
  anulado_motivo: string | null;
  creado_at: string;
  marchando_at: string | null;
  listo_at: string | null;
  entregado_at: string | null;
  despachado_at?: string | null;
  preparado_por: string | null;
}

export interface TurnoCaja {
  id: string;
  caja_nombre: string;
  cajero_id: string | null;
  estado: "abierto" | "cerrado";
  fondo_inicial: number;
  apertura_at: string;
  cierre_at: string | null;
  declarado: Partial<Record<MedioPago, number>> | null;
  esperado: Partial<Record<MedioPago, number>> | null;
  diferencia_total: number | null;
}

export interface MovimientoCaja {
  id: string;
  turno_id: string;
  pedido_id: string | null;
  tipo: "cobro" | "propina" | "ingreso" | "egreso" | "retiro";
  medio: MedioPago;
  monto: number;
  idempotency_key: string;
  created_at: string;
}

export interface Cupon {
  id: string;
  codigo: string;
  descuento_pct: number;
  origen: "manual" | "foto_ganadora" | "promo";
  usos_max: number;
  usos: number;
  vence_at: string | null;
  created_at: string;
}

export interface PuntoPrecio { t: number; p: number }   // epoch ms, precio

export interface MarketCrash {
  id: string;
  mensaje: string;
  productos: string[];
  descuento_pct: number | null;
  precios_previos: Record<string, number>;
  inicio_at: string;
  fin_at: string;
  finalizado: boolean;
  iniciado_por: string | null;
}

export interface Envio {
  id: string;
  pedido_id: string;
  cadete_id: string | null;
  estado: EstadoEnvio;
  direccion: string;
  lat_destino: number;
  lng_destino: number;
  latitud_actual: number | null;
  longitud_actual: number | null;
  velocidad_kmh: number | null;
  ultima_actualizacion: string | null;
  tracking_token: string;
  salida_at: string | null;
  entregado_at: string | null;
  created_at: string;
}

export interface Evento {
  id: string;
  titulo: string;
  subtitulo: string;
  descripcion: string;
  flyer_url: string | null;
  fecha: string;
  estado: "borrador" | "programado" | "publicado";
}

export interface Promocion {
  id: string;
  titulo: string;
  tipo: "happy_hour" | "2x1" | "descuento" | "combo";
  descuento_pct: number | null;
  categoria_id: string | null;
  dias: number[];
  hora_desde: string | null;
  hora_hasta: string | null;
  activa: boolean;
}

export interface FotoCliente {
  id: string;
  mesa_id: string | null;
  mesa_numero: number | null;
  url_foto: string;            // data URL (demo) o URL pública de Storage
  descripcion: string;
  sesion_cliente: string;
  estado: EstadoFoto;
  filtro_auto: "ok" | "revisar" | "pendiente";
  codigo_voto: string;
  votos_count: number;
  es_ganadora: boolean;
  cupon_codigo: string | null;
  created_at: string;
}

export interface Voto { foto_id: string; sesion_cliente: string; created_at: string }

export interface Reserva {
  id: string;
  mesa_id: string | null;
  nombre: string;
  telefono: string;
  personas: number;
  inicio: string;
  duracion_min: number;
  estado: EstadoReserva;
  notas: string | null;
}

export interface EsperaItem { id: string; nombre: string; personas: number; desde: string }

export interface Auditoria {
  id: string;
  usuario: string;
  accion: string;
  tipo: "operacion" | "seguridad" | "precio" | "caja" | "sistema";
  detalle: string;
  monto?: number | null;
  created_at: string;
}

export interface LogSistema {
  id: string;
  nivel: "debug" | "info" | "warn" | "error";
  origen: string;
  mensaje: string;
  created_at: string;
}

export interface CompraProveedor {
  id: string;
  insumo_id: string;
  cantidad: number;
  costo_unitario: number;
  proveedor: string;
  created_at: string;
}

export interface Merma {
  id: string;
  insumo_id: string;
  cantidad: number;
  motivo: "vencimiento" | "rotura" | "error" | "otro";
  created_at: string;
}

export interface IaRecomendacion {
  id: string;
  tipo: "compra" | "market_crash" | "promo" | "demora_cocina" | "upsell" | "precio" | "anomalia";
  titulo: string;
  detalle: string;
  accion: Record<string, unknown>;
  prioridad: 1 | 2 | 3;
  estado: "pendiente" | "aceptada" | "descartada" | "aplicada" | "expirada";
  created_at: string;
}

export interface Notificacion {
  id: string;
  para: "mozo" | "caja" | "todos";
  texto: string;
  mesa_numero: number | null;
  pedido_id: string | null;
  leida: boolean;
  created_at: string;
}

/** Estado completo de un bar (lo que ve la app). */
export interface NexoState {
  version: number;
  bar: Bar;
  bares: Bar[];
  usuarios: Usuario[];
  categorias: Categoria[];
  productos: Producto[];
  modificadores: Modificador[];
  insumos: Insumo[];
  recetas: RecetaItem[];
  sectores: Sector[];
  mesas: Mesa[];
  pedidos: Pedido[];
  items: PedidoItem[];
  turnos: TurnoCaja[];
  movimientos: MovimientoCaja[];
  cupones: Cupon[];
  historial: Record<string, PuntoPrecio[]>;
  crash: MarketCrash | null;
  crashes: MarketCrash[];
  envios: Envio[];
  eventos: Evento[];
  promociones: Promocion[];
  fotos: FotoCliente[];
  votos: Voto[];
  reservas: Reserva[];
  espera: EsperaItem[];
  auditoria: Auditoria[];
  logs: LogSistema[];
  compras: CompraProveedor[];
  mermas: Merma[];
  recomendaciones: IaRecomendacion[];
  notificaciones: Notificacion[];
  ultimo_tick: number;
  simulacion: boolean;
}

export interface Sesion {
  usuario_id: string;
  nombre: string;
  rol: Rol;
  bar_id: string | null;
  desde: number;
}
