-- =============================================================================
--  NEXORESTO · FASE 1 · Núcleo multi-tenant (Supabase / PostgreSQL 15+)
--  ---------------------------------------------------------------------------
--  Dominios: acceso y roles · carta y recetas · salón y reservas · pedidos/KDS
--            caja y finanzas · stock · exchange (precios dinámicos) · delivery
--            social (fotos, votos, eventos, promos) · auditoría
--
--  Convenciones
--   · PK uuid, created_at / updated_at en todas las tablas operativas.
--   · TODAS las tablas llevan bar_id → aislamiento por RLS entre bares.
--   · Dinero en numeric(12,2) (nunca float). Precios congelados al pedir.
--   · Claves idempotentes en pedidos y pagos (no hay doble cobro).
--   · La lógica crítica vive en funciones SECURITY DEFINER (RPC), no en el
--     navegador: crear pedido, cobrar, cambiar precios, cerrar votación.
--
--  Ejecutar completo en: Supabase → SQL Editor (o `supabase db push`).
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- -----------------------------------------------------------------------------
-- 0. TIPOS ENUMERADOS
-- -----------------------------------------------------------------------------
do $$ begin
  create type rol_usuario as enum
    ('super_admin','jefe','caja','mozo','cocina','bartender','pantalla_tv','cm','cadete');
exception when duplicate_object then null; end $$;

do $$ begin create type estacion_tipo   as enum ('cocina','barra');                                  exception when duplicate_object then null; end $$;
do $$ begin create type estado_mesa     as enum ('libre','ocupada','esperando','cuenta_pedida','reservada','demorada'); exception when duplicate_object then null; end $$;
do $$ begin create type tipo_pedido     as enum ('salon','mostrador','delivery','webapp_qr');         exception when duplicate_object then null; end $$;
do $$ begin create type estado_pedido   as enum ('borrador','confirmado','en_preparacion','listo','entregado','cerrado','anulado'); exception when duplicate_object then null; end $$;
do $$ begin create type estado_cocina   as enum ('pendiente','marchando','listo','entregado','anulado'); exception when duplicate_object then null; end $$;
do $$ begin create type medio_pago      as enum ('efectivo','debito','credito','qr','transferencia','cupon'); exception when duplicate_object then null; end $$;
do $$ begin create type estado_turno    as enum ('abierto','cerrado');                               exception when duplicate_object then null; end $$;
do $$ begin create type estado_envio    as enum ('pendiente','preparando','listo','en_camino','entregado','cancelado'); exception when duplicate_object then null; end $$;
do $$ begin create type estado_foto     as enum ('pendiente','aprobada','rechazada');                exception when duplicate_object then null; end $$;
do $$ begin create type estado_reserva  as enum ('pendiente','confirmada','sentada','no_show','cancelada'); exception when duplicate_object then null; end $$;
do $$ begin create type estado_licencia as enum ('activa','prueba','suspendida');                    exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Utilidad: updated_at automático
-- -----------------------------------------------------------------------------
create or replace function fn_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =============================================================================
-- 1. MULTI-TENANCY
-- =============================================================================
create table if not exists bares (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  nombre          text not null,
  moneda          text not null default 'ARS',
  zona_horaria    text not null default 'America/Argentina/Buenos_Aires',
  horarios        jsonb not null default '{"lun":["18:00","02:00"],"mar":["18:00","02:00"],"mie":["18:00","02:00"],"jue":["18:00","02:00"],"vie":["18:00","04:00"],"sab":["18:00","04:00"],"dom":null}',
  -- Reglas del motor Exchange (versionadas en exchange_reglas_historial)
  reglas_precios  jsonb not null default '{
      "ventana_min": 15,
      "objetivo_default": 6,
      "paso_pct_por_unidad": 1.0,
      "paso_max_pct": 3.0,
      "redondeo": 50,
      "margen_piso": 1.35,
      "tope_pct": 40,
      "crash_duracion_min": 10
  }',
  propina_sugerida_pct numeric(5,2) not null default 10,
  plan            text not null default 'pro',
  estado_licencia estado_licencia not null default 'prueba',
  licencia_vence  date,
  lat             double precision,
  lng             double precision,
  direccion       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_bares_upd before update on bares for each row execute function fn_set_updated_at();

-- =============================================================================
-- 2. USUARIOS Y ROLES (RBAC) + PIN
-- =============================================================================
create table if not exists perfiles_usuarios (
  id              uuid primary key references auth.users(id) on delete cascade,
  bar_id          uuid references bares(id) on delete cascade,      -- null solo para super_admin
  nombre          text not null,
  rol             rol_usuario not null,
  pin_hash        text,                                            -- crypt(pin, gen_salt('bf'))
  pin_intentos    smallint not null default 0,
  pin_bloqueado_hasta timestamptz,
  activo          boolean not null default true,
  avatar_url      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint perfil_bar_requerido check (rol = 'super_admin' or bar_id is not null)
);
create index if not exists idx_perfiles_bar on perfiles_usuarios(bar_id);
-- El PIN es único por bar (no puede haber dos empleados con el mismo PIN en un bar)
create trigger trg_perfiles_upd before update on perfiles_usuarios for each row execute function fn_set_updated_at();

-- Helpers de seguridad (SECURITY DEFINER para evitar recursión en RLS)
create or replace function auth_bar_id() returns uuid
language sql stable security definer set search_path = public as $$
  select bar_id from perfiles_usuarios where id = auth.uid() and activo
$$;

create or replace function auth_rol() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from perfiles_usuarios where id = auth.uid() and activo
$$;

create or replace function es_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'super_admin' from perfiles_usuarios where id = auth.uid() and activo), false)
$$;

-- ¿El usuario actual pertenece al bar y tiene alguno de estos roles?
create or replace function tiene_rol(p_bar uuid, p_roles rol_usuario[]) returns boolean
language sql stable security definer set search_path = public as $$
  select es_super_admin() or exists (
    select 1 from perfiles_usuarios
    where id = auth.uid() and activo and bar_id = p_bar
      and (rol = any(p_roles) or rol = 'jefe')
  )
$$;

create or replace function es_del_bar(p_bar uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select es_super_admin() or exists (
    select 1 from perfiles_usuarios where id = auth.uid() and activo and bar_id = p_bar
  )
$$;

-- Asigna/actualiza el PIN (lo hace el jefe o el super_admin)
create or replace function fijar_pin(p_usuario uuid, p_pin text) returns void
language plpgsql security definer set search_path = public as $$
declare v_bar uuid;
begin
  if p_pin !~ '^[0-9]{4}$' then raise exception 'El PIN debe tener 4 dígitos'; end if;
  select bar_id into v_bar from perfiles_usuarios where id = p_usuario;
  if not tiene_rol(v_bar, array['jefe']::rol_usuario[]) then raise exception 'Sin permiso'; end if;
  if exists (select 1 from perfiles_usuarios where bar_id = v_bar and id <> p_usuario
             and pin_hash is not null and pin_hash = crypt(p_pin, pin_hash)) then
    raise exception 'Ese PIN ya está en uso en este bar';
  end if;
  update perfiles_usuarios set pin_hash = crypt(p_pin, gen_salt('bf', 8)), pin_intentos = 0 where id = p_usuario;
end $$;

-- Verifica un PIN (la llama la ruta /api/auth/pin con service_role).
-- Bloquea 5 minutos tras 5 intentos fallidos sobre el mismo bar+dispositivo.
create or replace function verificar_pin(p_bar uuid, p_pin text)
returns table (usuario_id uuid, nombre text, rol rol_usuario)
language plpgsql security definer set search_path = public as $$
declare v perfiles_usuarios;
begin
  select * into v from perfiles_usuarios
   where bar_id = p_bar and activo and pin_hash is not null and pin_hash = crypt(p_pin, pin_hash)
   limit 1;
  if v.id is null then
    insert into auditoria(bar_id, accion, tipo, detalle) values (p_bar, 'login_pin_fallido', 'seguridad', '{}'::jsonb);
    return;
  end if;
  if v.pin_bloqueado_hasta is not null and v.pin_bloqueado_hasta > now() then
    raise exception 'Usuario bloqueado temporalmente';
  end if;
  update perfiles_usuarios set pin_intentos = 0 where id = v.id;
  insert into auditoria(bar_id, usuario_id, accion, tipo, detalle)
    values (p_bar, v.id, 'login_pin', 'seguridad', jsonb_build_object('rol', v.rol));
  return query select v.id, v.nombre, v.rol;
end $$;

-- =============================================================================
-- 3. AUDITORÍA (antes que el resto: muchas funciones escriben acá)
-- =============================================================================
create table if not exists auditoria (
  id          bigint generated always as identity primary key,
  bar_id      uuid references bares(id) on delete cascade,
  usuario_id  uuid,
  accion      text not null,                -- anulacion_item, descuento, cambio_precio, cierre_caja, market_crash...
  tipo        text not null default 'operacion',   -- operacion | seguridad | precio | caja | sistema
  entidad     text,
  entidad_id  text,
  detalle     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists idx_auditoria_bar_fecha on auditoria(bar_id, created_at desc);

create table if not exists logs_sistema (
  id          bigint generated always as identity primary key,
  bar_id      uuid references bares(id) on delete set null,
  nivel       text not null check (nivel in ('debug','info','warn','error')),
  origen      text not null,
  mensaje     text not null,
  contexto    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists idx_logs_fecha on logs_sistema(created_at desc);

-- =============================================================================
-- 4. CATÁLOGO, RECETAS (ESCANDALLOS) E INSUMOS
-- =============================================================================
create table if not exists categorias (
  id          uuid primary key default gen_random_uuid(),
  bar_id      uuid not null references bares(id) on delete cascade,
  nombre      text not null,
  orden       int not null default 0,
  estacion    estacion_tipo not null default 'cocina',
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (bar_id, nombre)
);
create trigger trg_categorias_upd before update on categorias for each row execute function fn_set_updated_at();

create table if not exists productos (
  id                    uuid primary key default gen_random_uuid(),
  bar_id                uuid not null references bares(id) on delete cascade,
  categoria_id          uuid references categorias(id) on delete set null,
  nombre                text not null,
  descripcion           text,
  icono                 text,                                     -- clave de ilustración (mojito, burger…)
  imagen_url            text,
  estacion              estacion_tipo not null default 'cocina',
  precio_base           numeric(12,2) not null check (precio_base > 0),
  precio_minimo         numeric(12,2) not null,
  precio_maximo         numeric(12,2) not null,
  precio_actual         numeric(12,2) not null,
  precio_anterior       numeric(12,2),
  variacion_porcentaje  numeric(7,2) not null default 0,          -- vs precio_base
  es_cotizable_bolsa    boolean not null default true,
  objetivo_ventana      int not null default 6,                   -- unidades objetivo por ventana Exchange
  tiempo_objetivo_min   int not null default 12,                  -- para el semáforo del KDS
  destacado             boolean not null default false,           -- aparece en los gráficos grandes de la TV
  activo                boolean not null default true,
  eliminado_at          timestamptz,                              -- borrado lógico
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint precios_coherentes check (precio_minimo <= precio_actual and precio_actual <= precio_maximo and precio_minimo <= precio_base and precio_base <= precio_maximo)
);
create index if not exists idx_productos_bar on productos(bar_id) where eliminado_at is null;
create trigger trg_productos_upd before update on productos for each row execute function fn_set_updated_at();

create table if not exists modificadores (
  id            uuid primary key default gen_random_uuid(),
  bar_id        uuid not null references bares(id) on delete cascade,
  producto_id   uuid references productos(id) on delete cascade,  -- null = aplica a la categoría
  categoria_id  uuid references categorias(id) on delete cascade,
  grupo         text not null,                                    -- "Punto de cocción", "Extras", "Hielo"
  nombre        text not null,
  precio_extra  numeric(12,2) not null default 0,
  exclusivo     boolean not null default false,                   -- true = se elige uno del grupo
  created_at    timestamptz not null default now()
);

create table if not exists proveedores (
  id          uuid primary key default gen_random_uuid(),
  bar_id      uuid not null references bares(id) on delete cascade,
  nombre      text not null,
  telefono    text,
  email       text,
  created_at  timestamptz not null default now()
);

create table if not exists insumos (
  id              uuid primary key default gen_random_uuid(),
  bar_id          uuid not null references bares(id) on delete cascade,
  nombre          text not null,
  rubro           text not null default 'General',
  unidad          text not null default 'u',                      -- ml, g, u, kg, bot
  stock_actual    numeric(14,3) not null default 0,
  stock_minimo    numeric(14,3) not null default 0,
  costo_unitario  numeric(12,4) not null default 0,               -- costo promedio ponderado por unidad
  proveedor_id    uuid references proveedores(id) on delete set null,
  vence_el        date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (bar_id, nombre)
);
create trigger trg_insumos_upd before update on insumos for each row execute function fn_set_updated_at();

create table if not exists recetas (
  id           uuid primary key default gen_random_uuid(),
  bar_id       uuid not null references bares(id) on delete cascade,
  producto_id  uuid not null references productos(id) on delete cascade,
  insumo_id    uuid not null references insumos(id) on delete restrict,
  cantidad     numeric(14,3) not null check (cantidad > 0),       -- en la unidad del insumo
  unique (producto_id, insumo_id)
);
create index if not exists idx_recetas_producto on recetas(producto_id);

create table if not exists movimientos_stock (
  id          bigint generated always as identity primary key,
  bar_id      uuid not null references bares(id) on delete cascade,
  insumo_id   uuid not null references insumos(id) on delete cascade,
  tipo        text not null check (tipo in ('venta','compra','merma','ajuste','devolucion')),
  cantidad    numeric(14,3) not null,                              -- negativo = egreso
  costo_unitario numeric(12,4),
  referencia  text,                                                -- pedido_id, compra_id…
  motivo      text,
  usuario_id  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists idx_mov_stock on movimientos_stock(bar_id, created_at desc);

-- Costo de receta (escandallo) de un producto
create or replace function costo_receta(p_producto uuid) returns numeric
language sql stable as $$
  select coalesce(sum(r.cantidad * i.costo_unitario), 0)::numeric(12,2)
  from recetas r join insumos i on i.id = r.insumo_id
  where r.producto_id = p_producto
$$;

-- =============================================================================
-- 5. SALÓN Y RESERVAS
-- =============================================================================
create table if not exists sectores (
  id          uuid primary key default gen_random_uuid(),
  bar_id      uuid not null references bares(id) on delete cascade,
  nombre      text not null,                                       -- Salón, Barra, Terraza
  orden       int not null default 0,
  unique (bar_id, nombre)
);

create table if not exists mesas (
  id          uuid primary key default gen_random_uuid(),
  bar_id      uuid not null references bares(id) on delete cascade,
  sector_id   uuid not null references sectores(id) on delete cascade,
  numero      int not null,
  capacidad   int not null default 4,
  estado      estado_mesa not null default 'libre',
  mozo_id     uuid references perfiles_usuarios(id) on delete set null,
  ocupada_desde timestamptz,
  qr_token    text not null default encode(gen_random_bytes(12), 'hex'),   -- token firmado del QR (no adivinable)
  pos_x       int, pos_y int,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (bar_id, numero)
);
create trigger trg_mesas_upd before update on mesas for each row execute function fn_set_updated_at();

create table if not exists reservas (
  id            uuid primary key default gen_random_uuid(),
  bar_id        uuid not null references bares(id) on delete cascade,
  mesa_id       uuid references mesas(id) on delete set null,
  nombre        text not null,
  telefono      text,
  personas      int not null check (personas > 0),
  inicio        timestamptz not null,
  duracion_min  int not null default 120,
  fin           timestamptz not null,                             -- lo calcula el trigger (inicio + duración)
  estado        estado_reserva not null default 'pendiente',
  notas         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Una mesa no puede tener dos reservas superpuestas
  constraint reservas_sin_superposicion exclude using gist (
    mesa_id with =,
    tstzrange(inicio, fin) with &&
  ) where (estado in ('pendiente','confirmada','sentada'))
);
create index if not exists idx_reservas_bar_inicio on reservas(bar_id, inicio);
create trigger trg_reservas_upd before update on reservas for each row execute function fn_set_updated_at();

create or replace function fn_reserva_fin() returns trigger language plpgsql as $$
begin
  new.fin := new.inicio + make_interval(mins => new.duracion_min);
  return new;
end $$;
create trigger trg_reservas_fin before insert or update of inicio, duracion_min on reservas
for each row execute function fn_reserva_fin();

-- =============================================================================
-- 6. PEDIDOS Y KDS
-- =============================================================================
create table if not exists pedidos (
  id               uuid primary key default gen_random_uuid(),
  bar_id           uuid not null references bares(id) on delete cascade,
  numero           int not null,
  tipo             tipo_pedido not null default 'salon',
  estado           estado_pedido not null default 'confirmado',
  mesa_id          uuid references mesas(id) on delete set null,
  mozo_id          uuid references perfiles_usuarios(id) on delete set null,
  cliente_nombre   text,
  cliente_telefono text,
  direccion        text,
  personas         int,
  subtotal         numeric(12,2) not null default 0,
  descuento        numeric(12,2) not null default 0,
  propina          numeric(12,2) not null default 0,
  total            numeric(12,2) not null default 0,
  pagado           numeric(12,2) not null default 0,
  en_market_crash  boolean not null default false,
  cupon_id         uuid,
  idempotency_key  text not null,
  stock_descontado boolean not null default false,
  confirmado_at    timestamptz,
  cerrado_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (bar_id, idempotency_key),
  unique (bar_id, numero)
);
create index if not exists idx_pedidos_bar_fecha on pedidos(bar_id, created_at desc);
create index if not exists idx_pedidos_mesa_abiertos on pedidos(mesa_id) where estado not in ('cerrado','anulado');
create trigger trg_pedidos_upd before update on pedidos for each row execute function fn_set_updated_at();

create table if not exists pedido_items (
  id               uuid primary key default gen_random_uuid(),
  bar_id           uuid not null references bares(id) on delete cascade,
  pedido_id        uuid not null references pedidos(id) on delete cascade,
  producto_id      uuid references productos(id) on delete set null,
  nombre           text not null,                                  -- snapshot
  cantidad         int not null check (cantidad > 0),
  precio_unitario  numeric(12,2) not null,                         -- precio congelado al pedir
  costo_unitario   numeric(12,2) not null default 0,               -- costo de receta congelado
  modificadores    jsonb not null default '[]',                    -- [{grupo,nombre,precio_extra}]
  notas            text,
  estacion         estacion_tipo not null,
  estado_cocina    estado_cocina not null default 'pendiente',
  en_market_crash  boolean not null default false,
  persona          smallint,                                       -- para dividir cuenta por comensal
  anulado_motivo   text,
  anulado_por      uuid,
  creado_at        timestamptz not null default now(),
  marchando_at     timestamptz,
  listo_at         timestamptz,
  entregado_at     timestamptz,
  despachado_at    timestamptz,                                    -- la estación despachó la comanda (sale del KDS)
  preparado_por    uuid references perfiles_usuarios(id) on delete set null,
  -- segundos de demora (para estadísticas del jefe y de la IA)
  demora_seg       int generated always as (
    case when listo_at is not null then extract(epoch from (listo_at - creado_at))::int end
  ) stored
);
create index if not exists idx_items_kds on pedido_items(bar_id, estacion, estado_cocina) where estado_cocina in ('pendiente','marchando','listo');
create index if not exists idx_items_pedido on pedido_items(pedido_id);
create index if not exists idx_items_producto_fecha on pedido_items(producto_id, creado_at);

-- =============================================================================
-- 7. CAJA Y FINANZAS
-- =============================================================================
create table if not exists cupones_descuento (
  id             uuid primary key default gen_random_uuid(),
  bar_id         uuid not null references bares(id) on delete cascade,
  codigo         text not null,
  descuento_pct  numeric(5,2) check (descuento_pct between 0 and 100),
  monto_fijo     numeric(12,2),
  origen         text not null default 'manual',                  -- manual | foto_ganadora | promo
  usos_max       int not null default 1,
  usos           int not null default 0,
  vence_at       timestamptz,
  created_at     timestamptz not null default now(),
  unique (bar_id, codigo)
);
alter table pedidos drop constraint if exists pedidos_cupon_fk;
alter table pedidos add constraint pedidos_cupon_fk foreign key (cupon_id) references cupones_descuento(id) on delete set null;

create table if not exists turnos_caja (
  id                 uuid primary key default gen_random_uuid(),
  bar_id             uuid not null references bares(id) on delete cascade,
  caja_nombre        text not null default 'Caja 1',
  cajero_id          uuid references perfiles_usuarios(id) on delete set null,
  estado             estado_turno not null default 'abierto',
  fondo_inicial      numeric(12,2) not null default 0,
  apertura_at        timestamptz not null default now(),
  cierre_at          timestamptz,
  -- Arqueo ciego: lo que el cajero declara ANTES de ver lo esperado
  declarado          jsonb,                                         -- {"efectivo":..,"debito":..,"credito":..,"qr":..,"transferencia":..}
  esperado           jsonb,                                         -- calculado por el sistema al cerrar
  diferencia_total   numeric(12,2),
  observaciones      text,
  created_at         timestamptz not null default now()
);
-- Solo un turno abierto por caja física
create unique index if not exists uq_turno_abierto on turnos_caja(bar_id, caja_nombre) where estado = 'abierto';

create table if not exists movimientos_caja (
  id               uuid primary key default gen_random_uuid(),
  bar_id           uuid not null references bares(id) on delete cascade,
  turno_id         uuid not null references turnos_caja(id) on delete restrict,
  pedido_id        uuid references pedidos(id) on delete set null,
  tipo             text not null check (tipo in ('cobro','propina','ingreso','egreso','retiro')),
  medio            medio_pago not null,
  monto            numeric(12,2) not null,
  idempotency_key  text not null,
  usuario_id       uuid,
  nota             text,
  created_at       timestamptz not null default now(),
  constraint pagos_idem unique (bar_id, idempotency_key)        -- no hay doble cobro
);
create index if not exists idx_movcaja_turno on movimientos_caja(turno_id);

-- =============================================================================
-- 8. EXCHANGE (PRECIOS DINÁMICOS)
-- =============================================================================
create table if not exists historial_precios (
  id           bigint generated always as identity primary key,
  bar_id       uuid not null references bares(id) on delete cascade,
  producto_id  uuid not null references productos(id) on delete cascade,
  precio       numeric(12,2) not null,
  precio_anterior numeric(12,2),
  vendidos_ventana int,
  regla        text not null default 'demanda',                    -- demanda | crash | crash_fin | manual | reversion
  usuario_id   uuid,
  created_at   timestamptz not null default now()
);
create index if not exists idx_hist_precios on historial_precios(producto_id, created_at desc);

create table if not exists exchange_reglas_historial (
  id          bigint generated always as identity primary key,
  bar_id      uuid not null references bares(id) on delete cascade,
  reglas      jsonb not null,
  usuario_id  uuid,
  created_at  timestamptz not null default now()
);

create table if not exists market_crashes (
  id              uuid primary key default gen_random_uuid(),
  bar_id          uuid not null references bares(id) on delete cascade,
  mensaje         text not null default 'MARKET CRASH',
  productos       uuid[] not null,
  descuento_pct   numeric(5,2),                                   -- null = cae al precio_minimo
  precios_previos jsonb not null default '{}',                    -- {producto_id: precio}
  inicio_at       timestamptz not null default now(),
  fin_at          timestamptz not null,
  finalizado      boolean not null default false,
  iniciado_por    uuid,
  created_at      timestamptz not null default now()
);
-- Un solo crash activo por bar
create unique index if not exists uq_crash_activo on market_crashes(bar_id) where not finalizado;

-- =============================================================================
-- 9. DELIVERY Y GPS
-- =============================================================================
create table if not exists envios_delivery (
  id                    uuid primary key default gen_random_uuid(),
  bar_id                uuid not null references bares(id) on delete cascade,
  pedido_id             uuid not null unique references pedidos(id) on delete cascade,
  cadete_id             uuid references perfiles_usuarios(id) on delete set null,
  estado                estado_envio not null default 'pendiente',
  direccion             text not null,
  lat_destino           double precision,
  lng_destino           double precision,
  latitud_actual        double precision,
  longitud_actual       double precision,
  velocidad_kmh         numeric(6,2),
  ultima_actualizacion  timestamptz,
  costo_envio           numeric(12,2) not null default 0,
  tracking_token        text not null default encode(gen_random_bytes(10), 'hex'),
  salida_at             timestamptz,
  entregado_at          timestamptz,
  created_at            timestamptz not null default now()
);
create index if not exists idx_envios_cadete on envios_delivery(cadete_id) where estado in ('listo','en_camino');

-- =============================================================================
-- 10. MÓDULO SOCIAL, EVENTOS Y CM
-- =============================================================================
create table if not exists eventos (
  id           uuid primary key default gen_random_uuid(),
  bar_id       uuid not null references bares(id) on delete cascade,
  titulo       text not null,
  subtitulo    text,
  descripcion  text,
  flyer_url    text,
  fecha        timestamptz not null,
  estado       text not null default 'publicado' check (estado in ('borrador','programado','publicado')),
  created_at   timestamptz not null default now()
);

create table if not exists promociones (
  id             uuid primary key default gen_random_uuid(),
  bar_id         uuid not null references bares(id) on delete cascade,
  titulo         text not null,
  tipo           text not null check (tipo in ('happy_hour','2x1','descuento','combo')),
  descuento_pct  numeric(5,2),
  categoria_id   uuid references categorias(id) on delete set null,
  dias           smallint[] not null default '{1,2,3,4,5,6,0}',   -- 0 = domingo
  hora_desde     time,
  hora_hasta     time,
  activa         boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists fotos_clientes (
  id               uuid primary key default gen_random_uuid(),
  bar_id           uuid not null references bares(id) on delete cascade,
  mesa_id          uuid references mesas(id) on delete set null,
  url_foto         text not null,                                -- ruta en Storage (bucket fotos-clientes)
  descripcion      text,
  sesion_cliente   text not null,                                -- id anónimo de la sesión de mesa
  estado           estado_foto not null default 'pendiente',
  aprobada_por_cm  uuid references perfiles_usuarios(id) on delete set null,
  filtro_auto      text not null default 'pendiente',            -- ok | revisar | pendiente
  codigo_voto      text not null default upper(substr(encode(gen_random_bytes(3),'hex'),1,4)),
  ronda            date not null default current_date,
  votos_count      int not null default 0,
  es_ganadora      boolean not null default false,
  cupon_id         uuid references cupones_descuento(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists idx_fotos_ronda on fotos_clientes(bar_id, ronda, estado);

create table if not exists votos_fotos (
  id              bigint generated always as identity primary key,
  bar_id          uuid not null references bares(id) on delete cascade,
  foto_id         uuid not null references fotos_clientes(id) on delete cascade,
  sesion_cliente  text not null,
  ronda           date not null default current_date,
  created_at      timestamptz not null default now(),
  unique (bar_id, sesion_cliente, ronda)                         -- 1 voto por ronda por cliente
);

-- =============================================================================
-- 11. TRIGGERS DE NEGOCIO
-- =============================================================================

-- 11.1 Descuento automático de stock al CONFIRMAR un pedido (atómico)
create or replace function fn_descontar_stock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'confirmado' and not new.stock_descontado
     and (tg_op = 'INSERT' or old.estado is distinct from 'confirmado') then

    -- egreso por cada insumo de cada ítem no anulado
    with consumo as (
      select r.insumo_id, sum(r.cantidad * pi.cantidad) as total
      from pedido_items pi
      join recetas r on r.producto_id = pi.producto_id
      where pi.pedido_id = new.id and pi.estado_cocina <> 'anulado'
      group by r.insumo_id
    ), upd as (
      update insumos i set stock_actual = i.stock_actual - c.total
      from consumo c where i.id = c.insumo_id
      returning i.id, c.total, i.costo_unitario
    )
    insert into movimientos_stock(bar_id, insumo_id, tipo, cantidad, costo_unitario, referencia)
    select new.bar_id, upd.id, 'venta', -upd.total, upd.costo_unitario, new.id::text from upd;

    new.stock_descontado := true;
    new.confirmado_at := coalesce(new.confirmado_at, now());
  end if;
  return new;
end $$;

drop trigger if exists trg_pedidos_stock on pedidos;
create trigger trg_pedidos_stock before insert or update of estado on pedidos
for each row execute function fn_descontar_stock();

-- 11.2 Recalcular totales del pedido cuando cambian los ítems
create or replace function fn_recalcular_pedido() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_pedido uuid := coalesce(new.pedido_id, old.pedido_id);
begin
  update pedidos p set
    subtotal = s.sub,
    total    = greatest(s.sub - p.descuento, 0) + p.propina
  from (
    select coalesce(sum(cantidad * (precio_unitario + coalesce((select sum((m->>'precio_extra')::numeric) from jsonb_array_elements(modificadores) m),0))),0) as sub
    from pedido_items where pedido_id = v_pedido and estado_cocina <> 'anulado'
  ) s
  where p.id = v_pedido;
  return null;
end $$;

drop trigger if exists trg_items_totales on pedido_items;
create trigger trg_items_totales after insert or update of cantidad, precio_unitario, estado_cocina, modificadores or delete on pedido_items
for each row execute function fn_recalcular_pedido();

-- 11.3 Timestamps del flujo KDS + estado de la mesa
create or replace function fn_items_flujo() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_mesa uuid;
begin
  if new.estado_cocina is distinct from old.estado_cocina then
    if new.estado_cocina = 'marchando' then new.marchando_at := coalesce(new.marchando_at, now()); end if;
    if new.estado_cocina = 'listo'     then new.listo_at     := coalesce(new.listo_at, now());     end if;
    if new.estado_cocina = 'entregado' then new.entregado_at := coalesce(new.entregado_at, now()); end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_items_flujo on pedido_items;
create trigger trg_items_flujo before update of estado_cocina on pedido_items
for each row execute function fn_items_flujo();

-- 11.4 Auditoría de cambios de precio manuales
create or replace function fn_auditar_precio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.precio_actual is distinct from old.precio_actual then
    new.precio_anterior := old.precio_actual;
    new.variacion_porcentaje := round(((new.precio_actual - new.precio_base) / new.precio_base) * 100, 2);
  end if;
  return new;
end $$;

drop trigger if exists trg_productos_precio on productos;
create trigger trg_productos_precio before update of precio_actual on productos
for each row execute function fn_auditar_precio();

-- =============================================================================
-- 12. FUNCIONES RPC (lógica crítica en el servidor)
-- =============================================================================

-- 12.1 Crear pedido con precio congelado e idempotencia.
-- p_items: [{"producto_id":uuid,"cantidad":int,"modificadores":[...],"notas":text,"persona":int}]
create or replace function crear_pedido(
  p_bar uuid, p_tipo tipo_pedido, p_mesa uuid, p_items jsonb, p_idempotency_key text,
  p_cliente jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid; v_num int; v_crash boolean; v_it jsonb; v_prod productos;
begin
  -- Idempotencia: si ya existe, devolvemos el original
  select id into v_id from pedidos where bar_id = p_bar and idempotency_key = p_idempotency_key;
  if v_id is not null then return v_id; end if;

  -- Personal del bar o cliente anónimo (webapp_qr/delivery)
  if p_tipo in ('salon','mostrador') and not tiene_rol(p_bar, array['mozo','caja']::rol_usuario[]) then
    raise exception 'Sin permiso para crear pedidos de salón';
  end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Pedido vacío'; end if;

  -- anti-abuso del QR: máximo 5 pedidos por minuto por mesa
  if p_tipo = 'webapp_qr' and (select count(*) from pedidos where mesa_id = p_mesa and created_at > now() - interval '1 minute') >= 5 then
    raise exception 'Demasiados pedidos, esperá un momento';
  end if;

  select exists(select 1 from market_crashes where bar_id = p_bar and not finalizado and fin_at > now()) into v_crash;
  perform pg_advisory_xact_lock(hashtext(p_bar::text));
  select coalesce(max(numero), 100) + 1 into v_num from pedidos where bar_id = p_bar;

  insert into pedidos(bar_id, numero, tipo, estado, mesa_id, mozo_id, cliente_nombre, cliente_telefono, direccion,
                      en_market_crash, idempotency_key)
  values (p_bar, v_num, p_tipo, 'borrador', p_mesa, case when p_tipo in ('salon','mostrador') then auth.uid() end,
          p_cliente->>'nombre', p_cliente->>'telefono', p_cliente->>'direccion', v_crash, p_idempotency_key)
  returning id into v_id;

  for v_it in select * from jsonb_array_elements(p_items) loop
    select * into v_prod from productos
     where id = (v_it->>'producto_id')::uuid and bar_id = p_bar and activo and eliminado_at is null;
    if v_prod.id is null then raise exception 'Producto inválido'; end if;
    insert into pedido_items(bar_id, pedido_id, producto_id, nombre, cantidad, precio_unitario, costo_unitario,
                             modificadores, notas, estacion, en_market_crash, persona)
    values (p_bar, v_id, v_prod.id, v_prod.nombre, greatest((v_it->>'cantidad')::int, 1),
            v_prod.precio_actual,                       -- PRECIO CONGELADO (cotización vigente)
            costo_receta(v_prod.id),
            case when jsonb_typeof(v_it->'modificadores') = 'array' then v_it->'modificadores' else '[]'::jsonb end, v_it->>'notas', v_prod.estacion, v_crash,
            nullif(v_it->>'persona','')::smallint);
  end loop;

  -- Confirmar → dispara el descuento de stock
  update pedidos set estado = 'confirmado' where id = v_id;
  if p_mesa is not null then
    update mesas set estado = 'esperando', ocupada_desde = coalesce(ocupada_desde, now()) where id = p_mesa;
  end if;
  return v_id;
end $$;

-- 12.2 Cambiar estado de un ítem en KDS (con auditoría de anulaciones)
create or replace function cambiar_estado_item(p_item uuid, p_estado estado_cocina, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v pedido_items;
begin
  select * into v from pedido_items where id = p_item;
  if v.id is null then raise exception 'Ítem inexistente'; end if;
  if p_estado = 'anulado' then
    if v.estado_cocina in ('marchando','listo') and not tiene_rol(v.bar_id, array['jefe']::rol_usuario[]) then
      raise exception 'Anular un ítem en preparación requiere PIN de gerente';
    end if;
    insert into auditoria(bar_id, usuario_id, accion, tipo, entidad, entidad_id, detalle)
    values (v.bar_id, auth.uid(), 'anulacion_item', 'operacion', 'pedido_items', p_item::text,
            jsonb_build_object('nombre', v.nombre, 'cantidad', v.cantidad, 'motivo', p_motivo, 'importe', v.cantidad * v.precio_unitario));
  elsif not tiene_rol(v.bar_id, array['cocina','bartender','mozo','caja']::rol_usuario[]) then
    raise exception 'Sin permiso';
  end if;
  update pedido_items set estado_cocina = p_estado, anulado_motivo = coalesce(p_motivo, anulado_motivo),
         preparado_por = case when p_estado in ('marchando','listo') then auth.uid() else preparado_por end
   where id = p_item;
end $$;

-- 12.3 Despachar comanda completa de una estación (KDS)
create or replace function despachar_comanda(p_pedido uuid, p_estacion estacion_tipo)
returns void language plpgsql security definer set search_path = public as $$
declare v_bar uuid; v_mesa uuid;
begin
  select bar_id, mesa_id into v_bar, v_mesa from pedidos where id = p_pedido;
  if not tiene_rol(v_bar, array['cocina','bartender']::rol_usuario[]) then raise exception 'Sin permiso'; end if;
  update pedido_items set estado_cocina = 'listo'
   where pedido_id = p_pedido and estacion = p_estacion and estado_cocina in ('pendiente','marchando');
  update pedido_items set despachado_at = now()
   where pedido_id = p_pedido and estacion = p_estacion and despachado_at is null and estado_cocina <> 'anulado';
  -- Si no queda nada pendiente en ninguna estación, el pedido está listo
  if not exists (select 1 from pedido_items where pedido_id = p_pedido and estado_cocina in ('pendiente','marchando')) then
    update pedidos set estado = 'listo' where id = p_pedido;
    if v_mesa is not null then update mesas set estado = 'ocupada' where id = v_mesa and estado in ('esperando','demorada'); end if;
    update envios_delivery set estado = 'listo' where pedido_id = p_pedido and estado in ('pendiente','preparando');
  end if;
end $$;

-- 12.4 Abrir turno de caja
create or replace function abrir_turno(p_bar uuid, p_caja text, p_fondo numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not tiene_rol(p_bar, array['caja']::rol_usuario[]) then raise exception 'Sin permiso'; end if;
  insert into turnos_caja(bar_id, caja_nombre, cajero_id, fondo_inicial)
  values (p_bar, p_caja, auth.uid(), p_fondo) returning id into v_id;
  insert into auditoria(bar_id, usuario_id, accion, tipo, entidad_id, detalle)
  values (p_bar, auth.uid(), 'apertura_caja', 'caja', v_id::text, jsonb_build_object('caja', p_caja, 'fondo', p_fondo));
  return v_id;
end $$;

-- 12.5 Registrar pago (multipago + propina) con idempotencia
-- p_pagos: [{"medio":"efectivo","monto":1000}, ...]
create or replace function registrar_pago(
  p_pedido uuid, p_turno uuid, p_pagos jsonb, p_propina numeric, p_idempotency_key text, p_cupon text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v pedidos; v_pago jsonb; v_i int := 0; v_total_pagado numeric := 0; v_cupon cupones_descuento; v_desc numeric := 0;
begin
  select * into v from pedidos where id = p_pedido for update;
  if not tiene_rol(v.bar_id, array['caja']::rol_usuario[]) then raise exception 'Sin permiso'; end if;
  -- idempotencia: si la primera parte ya existe, devolvemos el estado actual
  if exists (select 1 from movimientos_caja where bar_id = v.bar_id and idempotency_key = p_idempotency_key || ':0') then
    return jsonb_build_object('pedido', v.id, 'duplicado', true, 'pagado', v.pagado);
  end if;
  if (select estado from turnos_caja where id = p_turno) <> 'abierto' then raise exception 'El turno está cerrado'; end if;

  if p_cupon is not null then
    select * into v_cupon from cupones_descuento
     where bar_id = v.bar_id and codigo = upper(p_cupon) and usos < usos_max and (vence_at is null or vence_at > now());
    if v_cupon.id is null then raise exception 'Cupón inválido o vencido'; end if;
    v_desc := coalesce(v_cupon.monto_fijo, round(v.subtotal * v_cupon.descuento_pct / 100, 2));
    update cupones_descuento set usos = usos + 1 where id = v_cupon.id;
    insert into auditoria(bar_id, usuario_id, accion, tipo, entidad_id, detalle)
    values (v.bar_id, auth.uid(), 'descuento', 'caja', v.id::text, jsonb_build_object('cupon', v_cupon.codigo, 'monto', v_desc));
  end if;

  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    insert into movimientos_caja(bar_id, turno_id, pedido_id, tipo, medio, monto, idempotency_key, usuario_id)
    values (v.bar_id, p_turno, v.id, 'cobro', (v_pago->>'medio')::medio_pago, (v_pago->>'monto')::numeric,
            p_idempotency_key || ':' || v_i, auth.uid());
    v_total_pagado := v_total_pagado + (v_pago->>'monto')::numeric;
    v_i := v_i + 1;
  end loop;
  if coalesce(p_propina,0) > 0 then
    insert into movimientos_caja(bar_id, turno_id, pedido_id, tipo, medio, monto, idempotency_key, usuario_id)
    values (v.bar_id, p_turno, v.id, 'propina', coalesce((p_pagos->0->>'medio')::medio_pago, 'efectivo'), p_propina,
            p_idempotency_key || ':propina', auth.uid());
  end if;

  update pedidos set descuento = descuento + v_desc, propina = coalesce(p_propina,0),
         total = greatest(subtotal - (descuento + v_desc), 0) + coalesce(p_propina,0),
         pagado = pagado + v_total_pagado + coalesce(p_propina,0), cupon_id = coalesce(v_cupon.id, cupon_id)
   where id = v.id returning * into v;

  if v.pagado >= v.total then
    update pedidos set estado = 'cerrado', cerrado_at = now() where id = v.id;
    if v.mesa_id is not null and not exists (
       select 1 from pedidos where mesa_id = v.mesa_id and id <> v.id and estado not in ('cerrado','anulado')) then
      update mesas set estado = 'libre', mozo_id = null, ocupada_desde = null where id = v.mesa_id;
    end if;
  end if;
  return jsonb_build_object('pedido', v.id, 'pagado', v.pagado, 'total', v.total, 'cerrado', v.pagado >= v.total);
end $$;

-- 12.6 Cierre de turno con ARQUEO CIEGO: el cajero declara primero; recién
--      después el sistema calcula y devuelve lo esperado y la diferencia.
create or replace function cerrar_turno(p_turno uuid, p_declarado jsonb, p_observaciones text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v turnos_caja; v_esperado jsonb; v_dif numeric;
begin
  select * into v from turnos_caja where id = p_turno for update;
  if v.estado <> 'abierto' then raise exception 'El turno ya está cerrado'; end if;
  if not tiene_rol(v.bar_id, array['caja']::rol_usuario[]) then raise exception 'Sin permiso'; end if;
  if exists (select 1 from pedidos p join mesas m on m.id = p.mesa_id
             where p.bar_id = v.bar_id and p.estado not in ('cerrado','anulado') and p.tipo = 'salon') then
    raise exception 'No se puede cerrar el turno con mesas abiertas';
  end if;

  select jsonb_object_agg(medio, total) into v_esperado from (
    select m::text as medio,
           coalesce((select sum(monto) from movimientos_caja mc where mc.turno_id = v.id and mc.medio = m
                      and tipo in ('cobro','propina','ingreso')), 0)
         - coalesce((select sum(monto) from movimientos_caja mc where mc.turno_id = v.id and mc.medio = m
                      and tipo in ('egreso','retiro')), 0)
         + case when m = 'efectivo' then v.fondo_inicial else 0 end as total
    from unnest(enum_range(null::medio_pago)) m where m <> 'cupon'
  ) t;

  select sum(coalesce((p_declarado->>k)::numeric, 0) - (v_esperado->>k)::numeric) into v_dif
  from jsonb_object_keys(v_esperado) k;

  update turnos_caja set estado = 'cerrado', cierre_at = now(), declarado = p_declarado,
         esperado = v_esperado, diferencia_total = v_dif, observaciones = p_observaciones
   where id = v.id;
  insert into auditoria(bar_id, usuario_id, accion, tipo, entidad_id, detalle)
  values (v.bar_id, auth.uid(), 'cierre_caja', 'caja', v.id::text,
          jsonb_build_object('declarado', p_declarado, 'esperado', v_esperado, 'diferencia', v_dif));
  return jsonb_build_object('esperado', v_esperado, 'declarado', p_declarado, 'diferencia', v_dif);
end $$;

-- 12.7 MOTOR EXCHANGE (también implementado como función pura en src/lib/exchangeEngine.ts)
--   exceso = vendidos - objetivo
--   paso   = clamp(paso_pct_por_unidad% × exceso, -paso_max%, +paso_max%)
--   nuevo  = round_redondeo(precio × (1 + paso))
--   precio = clamp(nuevo, piso, tope)   con piso = max(precio_minimo, costo × margen_piso)
create or replace function exchange_tick(p_bar uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; v_ventana int; v_paso_u numeric; v_paso_max numeric; v_red numeric; v_margen numeric;
  p record; v_vend int; v_paso numeric; v_nuevo numeric; v_piso numeric; v_n int := 0;
begin
  -- Durante un Market Crash el motor no toca los productos afectados
  select reglas_precios into r from bares where id = p_bar and estado_licencia <> 'suspendida';
  if r is null then return 0; end if;
  v_ventana  := coalesce((r->>'ventana_min')::int, 15);
  v_paso_u   := coalesce((r->>'paso_pct_por_unidad')::numeric, 1) / 100;
  v_paso_max := coalesce((r->>'paso_max_pct')::numeric, 3) / 100;
  v_red      := coalesce((r->>'redondeo')::numeric, 50);
  v_margen   := coalesce((r->>'margen_piso')::numeric, 1.35);

  for p in
    select pr.* from productos pr
    where pr.bar_id = p_bar and pr.activo and pr.es_cotizable_bolsa and pr.eliminado_at is null
      and not exists (select 1 from market_crashes c where c.bar_id = p_bar and not c.finalizado and pr.id = any(c.productos))
  loop
    select coalesce(sum(cantidad), 0) into v_vend from pedido_items
     where producto_id = p.id and estado_cocina <> 'anulado' and creado_at > now() - make_interval(mins => v_ventana);
    v_paso  := greatest(least(v_paso_u * (v_vend - p.objetivo_ventana), v_paso_max), -v_paso_max);
    v_piso  := greatest(p.precio_minimo, ceil(costo_receta(p.id) * v_margen / v_red) * v_red);
    v_nuevo := round(p.precio_actual * (1 + v_paso) / v_red) * v_red;
    v_nuevo := least(greatest(v_nuevo, v_piso), p.precio_maximo);
    if v_nuevo <> p.precio_actual then
      update productos set precio_actual = v_nuevo where id = p.id;
      v_n := v_n + 1;
    end if;
    insert into historial_precios(bar_id, producto_id, precio, precio_anterior, vendidos_ventana, regla)
    values (p_bar, p.id, v_nuevo, p.precio_actual, v_vend, 'demanda');
  end loop;

  -- Fin automático de crashes vencidos
  perform finalizar_market_crash(id) from market_crashes where bar_id = p_bar and not finalizado and fin_at <= now();
  return v_n;
end $$;

-- 12.8 MARKET CRASH: el CM o el jefe lo lanzan; 10 min a precio mínimo (o -X%)
create or replace function lanzar_market_crash(
  p_bar uuid, p_productos uuid[], p_mensaje text default 'MARKET CRASH', p_minutos int default null, p_descuento_pct numeric default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_prev jsonb; v_min int;
begin
  if not tiene_rol(p_bar, array['cm']::rol_usuario[]) then raise exception 'Sin permiso'; end if;
  if exists (select 1 from market_crashes where bar_id = p_bar and not finalizado) then
    raise exception 'Ya hay un Market Crash activo';
  end if;
  select coalesce(p_minutos, (reglas_precios->>'crash_duracion_min')::int, 10) into v_min from bares where id = p_bar;
  select jsonb_object_agg(id::text, precio_actual) into v_prev from productos where id = any(p_productos) and bar_id = p_bar;

  insert into market_crashes(bar_id, mensaje, productos, descuento_pct, precios_previos, fin_at, iniciado_por)
  values (p_bar, p_mensaje, p_productos, p_descuento_pct, coalesce(v_prev,'{}'), now() + make_interval(mins => v_min), auth.uid())
  returning id into v_id;

  update productos set precio_actual = case
      when p_descuento_pct is null then precio_minimo
      else greatest(precio_minimo, round(precio_actual * (1 - p_descuento_pct/100) / 50) * 50) end
   where id = any(p_productos) and bar_id = p_bar;

  insert into historial_precios(bar_id, producto_id, precio, regla, usuario_id)
  select p_bar, id, precio_actual, 'crash', auth.uid() from productos where id = any(p_productos);
  insert into auditoria(bar_id, usuario_id, accion, tipo, entidad_id, detalle)
  values (p_bar, auth.uid(), 'market_crash', 'precio', v_id::text,
          jsonb_build_object('productos', p_productos, 'minutos', v_min, 'mensaje', p_mensaje));
  return v_id;
end $$;

create or replace function finalizar_market_crash(p_crash uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v market_crashes; k text;
begin
  select * into v from market_crashes where id = p_crash for update;
  if v.finalizado then return; end if;
  for k in select jsonb_object_keys(v.precios_previos) loop
    update productos set precio_actual = (v.precios_previos->>k)::numeric where id = k::uuid;
    insert into historial_precios(bar_id, producto_id, precio, regla) values (v.bar_id, k::uuid, (v.precios_previos->>k)::numeric, 'crash_fin');
  end loop;
  update market_crashes set finalizado = true, fin_at = least(fin_at, now()) where id = p_crash;
end $$;

-- 12.9 Votar foto (1 voto por cliente y por ronda)
create or replace function votar_foto(p_foto uuid, p_sesion text) returns int
language plpgsql security definer set search_path = public as $$
declare v fotos_clientes;
begin
  select * into v from fotos_clientes where id = p_foto and estado = 'aprobada';
  if v.id is null then raise exception 'Foto no disponible'; end if;
  if v.sesion_cliente = p_sesion then raise exception 'No podés votar tu propia foto'; end if;
  insert into votos_fotos(bar_id, foto_id, sesion_cliente, ronda) values (v.bar_id, v.id, p_sesion, v.ronda);
  update fotos_clientes set votos_count = votos_count + 1 where id = v.id returning votos_count into v.votos_count;
  return v.votos_count;
exception when unique_violation then
  raise exception 'Ya votaste en esta ronda';
end $$;

-- 12.10 Cerrar votación de la noche → cupón automático para la foto ganadora
create or replace function cerrar_votacion(p_bar uuid, p_descuento numeric default 20) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v fotos_clientes; v_cupon cupones_descuento;
begin
  if not tiene_rol(p_bar, array['cm']::rol_usuario[]) then raise exception 'Sin permiso'; end if;
  select * into v from fotos_clientes
   where bar_id = p_bar and ronda = current_date and estado = 'aprobada' and not es_ganadora
   order by votos_count desc, created_at asc limit 1;
  if v.id is null then return jsonb_build_object('ganadora', null); end if;
  insert into cupones_descuento(bar_id, codigo, descuento_pct, origen, vence_at)
  values (p_bar, 'FOTO-' || upper(substr(encode(gen_random_bytes(4),'hex'),1,6)), p_descuento, 'foto_ganadora', now() + interval '30 days')
  returning * into v_cupon;
  update fotos_clientes set es_ganadora = true, cupon_id = v_cupon.id where id = v.id;
  insert into auditoria(bar_id, usuario_id, accion, tipo, entidad_id, detalle)
  values (p_bar, auth.uid(), 'cierre_votacion', 'operacion', v.id::text, jsonb_build_object('cupon', v_cupon.codigo, 'votos', v.votos_count));
  return jsonb_build_object('ganadora', v.id, 'cupon', v_cupon.codigo, 'votos', v.votos_count);
end $$;

-- 12.11 Posición GPS del cadete (solo mientras tiene un envío activo)
create or replace function actualizar_gps(p_envio uuid, p_lat double precision, p_lng double precision, p_vel numeric default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update envios_delivery set latitud_actual = p_lat, longitud_actual = p_lng, velocidad_kmh = p_vel,
         ultima_actualizacion = now()
   where id = p_envio and cadete_id = auth.uid() and estado = 'en_camino';
  if not found then raise exception 'Envío no activo para este cadete'; end if;
end $$;

-- =============================================================================
-- 13. VISTAS PARA REPORTES
-- =============================================================================
create or replace view v_rentabilidad_productos with (security_invoker = true) as
select p.bar_id, p.id as producto_id, p.nombre, p.precio_actual,
       costo_receta(p.id) as costo,
       case when p.precio_actual > 0 then round((1 - costo_receta(p.id) / p.precio_actual) * 100, 1) end as margen_pct,
       coalesce(sum(pi.cantidad) filter (where pi.creado_at > now() - interval '30 days'), 0) as unidades_30d,
       coalesce(sum(pi.cantidad * (pi.precio_unitario - pi.costo_unitario)) filter (where pi.creado_at > now() - interval '30 days'), 0) as ganancia_30d
from productos p
left join pedido_items pi on pi.producto_id = p.id and pi.estado_cocina <> 'anulado'
where p.eliminado_at is null
group by p.id;

create or replace view v_ventas_por_hora with (security_invoker = true) as
select bar_id, date_trunc('hour', created_at) as hora, count(*) as pedidos, sum(total) as ventas
from pedidos where estado <> 'anulado'
group by bar_id, date_trunc('hour', created_at);

create or replace view v_tiempos_cocina with (security_invoker = true) as
select bar_id, estacion, preparado_por, date_trunc('day', creado_at) as dia,
       round(avg(demora_seg)) as demora_prom_seg, count(*) as items
from pedido_items where demora_seg is not null
group by bar_id, estacion, preparado_por, date_trunc('day', creado_at);

-- =============================================================================
-- 14. ROW LEVEL SECURITY
-- =============================================================================
alter table bares                    enable row level security;
alter table perfiles_usuarios        enable row level security;
alter table auditoria                enable row level security;
alter table logs_sistema             enable row level security;
alter table categorias               enable row level security;
alter table productos                enable row level security;
alter table modificadores            enable row level security;
alter table proveedores              enable row level security;
alter table insumos                  enable row level security;
alter table recetas                  enable row level security;
alter table movimientos_stock        enable row level security;
alter table sectores                 enable row level security;
alter table mesas                    enable row level security;
alter table reservas                 enable row level security;
alter table pedidos                  enable row level security;
alter table pedido_items             enable row level security;
alter table cupones_descuento        enable row level security;
alter table turnos_caja              enable row level security;
alter table movimientos_caja         enable row level security;
alter table historial_precios        enable row level security;
alter table exchange_reglas_historial enable row level security;
alter table market_crashes           enable row level security;
alter table envios_delivery          enable row level security;
alter table eventos                  enable row level security;
alter table promociones              enable row level security;
alter table fotos_clientes           enable row level security;
alter table votos_fotos              enable row level security;

-- Bares: cada usuario ve su bar; super_admin ve y gestiona todos. Lectura pública
-- mínima (nombre/slug) para la TV y el menú QR se hace vía la vista v_bares_publicos.
create policy bares_select on bares for select using (es_del_bar(id));
create policy bares_admin  on bares for all    using (es_super_admin()) with check (es_super_admin());
create policy bares_jefe_upd on bares for update using (tiene_rol(id, array['jefe']::rol_usuario[]));

create policy perfiles_select on perfiles_usuarios for select using (id = auth.uid() or es_del_bar(bar_id));
create policy perfiles_admin  on perfiles_usuarios for all
  using (tiene_rol(bar_id, array['jefe']::rol_usuario[])) with check (tiene_rol(bar_id, array['jefe']::rol_usuario[]) and rol <> 'super_admin');

create policy auditoria_select on auditoria for select using (tiene_rol(bar_id, array['jefe']::rol_usuario[]));
create policy logs_select      on logs_sistema for select using (es_super_admin());

-- Catálogo: lectura para todo el personal del bar; escritura jefe
do $$
declare t text;
begin
  foreach t in array array['categorias','productos','modificadores','sectores','eventos','promociones'] loop
    execute format('create policy %1$s_select on %1$s for select using (es_del_bar(bar_id))', t);
  end loop;
  foreach t in array array['categorias','productos','modificadores','sectores','proveedores','insumos','recetas'] loop
    execute format('create policy %1$s_write on %1$s for all using (tiene_rol(bar_id, array[''jefe'']::rol_usuario[])) with check (tiene_rol(bar_id, array[''jefe'']::rol_usuario[]))', t);
  end loop;
end $$;

-- Stock: el CM NO ve costos (regla del producto). Cocina/barra/jefe sí.
create policy insumos_select on insumos for select using (tiene_rol(bar_id, array['cocina','bartender','caja']::rol_usuario[]));
create policy recetas_select on recetas for select using (tiene_rol(bar_id, array['cocina','bartender']::rol_usuario[]));
create policy proveedores_select on proveedores for select using (tiene_rol(bar_id, array['jefe']::rol_usuario[]));
create policy movstock_select on movimientos_stock for select using (tiene_rol(bar_id, array['jefe']::rol_usuario[]));
create policy movstock_insert on movimientos_stock for insert with check (tiene_rol(bar_id, array['cocina','bartender']::rol_usuario[]));

-- Salón
create policy mesas_select on mesas for select using (es_del_bar(bar_id));
create policy mesas_update on mesas for update using (tiene_rol(bar_id, array['mozo','caja']::rol_usuario[]));
create policy mesas_write  on mesas for all using (tiene_rol(bar_id, array['jefe']::rol_usuario[]));
create policy reservas_all on reservas for all using (tiene_rol(bar_id, array['caja','mozo']::rol_usuario[]))
  with check (tiene_rol(bar_id, array['caja','mozo']::rol_usuario[]));

-- Pedidos (la creación va por la RPC crear_pedido)
create policy pedidos_select on pedidos for select using (es_del_bar(bar_id));
create policy pedidos_update on pedidos for update using (tiene_rol(bar_id, array['mozo','caja']::rol_usuario[]));
create policy items_select   on pedido_items for select using (es_del_bar(bar_id));
create policy items_update   on pedido_items for update using (tiene_rol(bar_id, array['mozo','caja','cocina','bartender']::rol_usuario[]));

-- Caja
create policy turnos_select  on turnos_caja for select using (tiene_rol(bar_id, array['caja']::rol_usuario[]));
create policy movcaja_select on movimientos_caja for select using (tiene_rol(bar_id, array['caja']::rol_usuario[]));
create policy movcaja_insert on movimientos_caja for insert with check (tiene_rol(bar_id, array['caja']::rol_usuario[]));
create policy cupones_select on cupones_descuento for select using (tiene_rol(bar_id, array['caja','cm']::rol_usuario[]));
create policy cupones_write  on cupones_descuento for all using (tiene_rol(bar_id, array['cm']::rol_usuario[]));

-- Exchange
create policy hist_select   on historial_precios for select using (es_del_bar(bar_id));
create policy crash_select  on market_crashes for select using (es_del_bar(bar_id));
create policy reglas_select on exchange_reglas_historial for select using (tiene_rol(bar_id, array['jefe']::rol_usuario[]));

-- Delivery: la caja ve todo; el cadete solo sus envíos
create policy envios_caja   on envios_delivery for all using (tiene_rol(bar_id, array['caja']::rol_usuario[]));
create policy envios_cadete on envios_delivery for select using (cadete_id = auth.uid());
create policy envios_cadete_upd on envios_delivery for update using (cadete_id = auth.uid());

-- Social
create policy eventos_cm on eventos for all using (tiene_rol(bar_id, array['cm']::rol_usuario[])) with check (tiene_rol(bar_id, array['cm']::rol_usuario[]));
create policy promos_cm  on promociones for all using (tiene_rol(bar_id, array['cm']::rol_usuario[])) with check (tiene_rol(bar_id, array['cm']::rol_usuario[]));
create policy fotos_staff on fotos_clientes for select using (es_del_bar(bar_id));
create policy fotos_cm    on fotos_clientes for update using (tiene_rol(bar_id, array['cm']::rol_usuario[]));
create policy votos_staff on votos_fotos for select using (tiene_rol(bar_id, array['cm']::rol_usuario[]));

-- =============================================================================
-- 15. ACCESO PÚBLICO CONTROLADO (TV del salón y WebApp QR, rol anon)
--     El público nunca lee tablas: lee vistas acotadas y escribe solo vía RPC.
-- =============================================================================
create or replace view v_bares_publicos as
  select id, slug, nombre, moneda, lat, lng, direccion from bares where estado_licencia <> 'suspendida';

create or replace view v_carta_publica as
  select p.id, p.bar_id, p.categoria_id, c.nombre as categoria, p.nombre, p.descripcion, p.icono, p.imagen_url,
         p.estacion, p.precio_actual, p.precio_anterior, p.precio_base, p.variacion_porcentaje,
         p.es_cotizable_bolsa, p.destacado
  from productos p left join categorias c on c.id = p.categoria_id
  where p.activo and p.eliminado_at is null;

create or replace view v_fotos_publicas as
  select id, bar_id, mesa_id, url_foto, descripcion, codigo_voto, votos_count, es_ganadora, ronda, created_at
  from fotos_clientes where estado = 'aprobada';

create or replace view v_crash_activo as
  select id, bar_id, mensaje, productos, inicio_at, fin_at from market_crashes where not finalizado and fin_at > now();

create or replace view v_historial_publico as
  select bar_id, producto_id, precio, created_at from historial_precios where created_at > now() - interval '12 hours';

-- Subida de foto desde la mesa (la URL ya subida a Storage)
create or replace function subir_foto_cliente(p_bar uuid, p_mesa_token text, p_url text, p_descripcion text, p_sesion text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_mesa uuid; v_id uuid;
begin
  select id into v_mesa from mesas where bar_id = p_bar and qr_token = p_mesa_token;
  if v_mesa is null then raise exception 'QR inválido'; end if;
  if (select count(*) from fotos_clientes where sesion_cliente = p_sesion and ronda = current_date) >= 3 then
    raise exception 'Máximo 3 fotos por noche';
  end if;
  insert into fotos_clientes(bar_id, mesa_id, url_foto, descripcion, sesion_cliente)
  values (p_bar, v_mesa, p_url, left(p_descripcion, 140), p_sesion) returning id into v_id;
  return v_id;
end $$;

grant select on v_bares_publicos, v_carta_publica, v_fotos_publicas, v_crash_activo, v_historial_publico to anon, authenticated;
grant select on eventos, promociones to anon;
create policy eventos_publicos on eventos for select to anon using (estado = 'publicado');
create policy promos_publicas  on promociones for select to anon using (activa);
grant execute on function crear_pedido(uuid, tipo_pedido, uuid, jsonb, text, jsonb) to anon, authenticated;
grant execute on function votar_foto(uuid, text) to anon, authenticated;
grant execute on function subir_foto_cliente(uuid, text, text, text, text) to anon, authenticated;
revoke execute on function verificar_pin(uuid, text) from anon, authenticated;
revoke execute on function exchange_tick(uuid) from anon, authenticated;

-- =============================================================================
-- 16. REALTIME (canal por bar: la app filtra por bar_id / estación)
-- =============================================================================
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['productos','mesas','pedidos','pedido_items','market_crashes','fotos_clientes',
                             'envios_delivery','eventos','promociones','turnos_caja','reservas','insumos'] loop
      begin
        execute format('alter publication supabase_realtime add table %I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;

-- =============================================================================
-- 17. STORAGE (bucket de fotos de clientes y flyers)
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('fotos-clientes', 'fotos-clientes', true) on conflict (id) do nothing;
    insert into storage.buckets (id, name, public) values ('flyers', 'flyers', true) on conflict (id) do nothing;
  end if;
end $$;

-- =============================================================================
-- 18. pg_cron: motor Exchange cada 15 min (o usar /api/exchange/tick en Vercel)
-- =============================================================================
-- create extension if not exists pg_cron;
-- select cron.schedule('exchange-tick', '*/15 * * * *',
--   $$ select exchange_tick(id) from bares where estado_licencia <> 'suspendida' $$);
