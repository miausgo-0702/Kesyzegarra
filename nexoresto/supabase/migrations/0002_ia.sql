-- =============================================================================
--  NEXORESTO · FASE 7 · Memoria y aprendizaje de la IA (por bar)
--  ---------------------------------------------------------------------------
--  Arquitectura híbrida:
--   · Aprendizaje estadístico en PostgreSQL (promedios móviles, co-ocurrencia,
--     proyecciones) → rápido, explicable, sin costo por consulta.
--   · LLM (Claude, tool use) solo para conversar y redactar, leyendo estas
--     tablas con herramientas de solo lectura (ver /api/ai-copilot).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Patrones de demanda: promedio móvil exponencial por producto × día × franja
-- -----------------------------------------------------------------------------
create table if not exists ia_patrones_demanda (
  id                    bigint generated always as identity primary key,
  bar_id                uuid not null references bares(id) on delete cascade,
  producto_id           uuid not null references productos(id) on delete cascade,
  dia_semana            smallint not null check (dia_semana between 0 and 6),   -- 0 = domingo
  franja_hora           smallint not null check (franja_hora between 0 and 23),
  ventas_prom           numeric(10,3) not null default 0,     -- EMA de unidades vendidas en la franja
  ventas_desvio         numeric(10,3) not null default 0,     -- desvío móvil (detecta anomalías)
  tiempo_prep_prom_seg  numeric(10,1),                         -- tiempo real de preparación en KDS
  muestras              int not null default 0,
  updated_at            timestamptz not null default now(),
  unique (bar_id, producto_id, dia_semana, franja_hora)
);
create index if not exists idx_ia_patrones_bar on ia_patrones_demanda(bar_id, dia_semana, franja_hora);

-- -----------------------------------------------------------------------------
-- 2. Afinidad entre productos (market basket): qué se pide junto
-- -----------------------------------------------------------------------------
create table if not exists ia_afinidad_productos (
  bar_id         uuid not null references bares(id) on delete cascade,
  producto_a     uuid not null references productos(id) on delete cascade,
  producto_b     uuid not null references productos(id) on delete cascade,
  coocurrencias  int not null default 0,                 -- pedidos que tienen A y B
  updated_at     timestamptz not null default now(),
  primary key (bar_id, producto_a, producto_b),
  check (producto_a <> producto_b)
);

-- Frecuencia individual (denominador para confianza y lift)
create table if not exists ia_frecuencia_productos (
  bar_id       uuid not null references bares(id) on delete cascade,
  producto_id  uuid not null references productos(id) on delete cascade,
  pedidos      int not null default 0,
  primary key (bar_id, producto_id)
);

create table if not exists ia_totales_bar (
  bar_id   uuid primary key references bares(id) on delete cascade,
  pedidos  int not null default 0
);

-- -----------------------------------------------------------------------------
-- 3. Historial de recomendaciones (aprendizaje por refuerzo humano)
-- -----------------------------------------------------------------------------
create table if not exists ia_recomendaciones_log (
  id              uuid primary key default gen_random_uuid(),
  bar_id          uuid not null references bares(id) on delete cascade,
  tipo            text not null check (tipo in ('compra','market_crash','promo','demora_cocina','upsell','precio','anomalia')),
  titulo          text not null,
  detalle         text,
  accion          jsonb not null default '{}',      -- payload para "Aplicar en 1 clic"
  prioridad       smallint not null default 2 check (prioridad between 1 and 3),
  estado          text not null default 'pendiente' check (estado in ('pendiente','aceptada','descartada','aplicada','expirada')),
  origen          text not null default 'motor' check (origen in ('motor','copiloto')),
  decidido_por    uuid references perfiles_usuarios(id) on delete set null,
  decidido_at     timestamptz,
  -- Impacto medido: ventas del/los producto(s) afectados 60 min antes vs después
  ventas_antes    numeric(12,2),
  ventas_despues  numeric(12,2),
  impacto_pct     numeric(7,2) generated always as (
    case when ventas_antes > 0 then round((ventas_despues - ventas_antes) / ventas_antes * 100, 2) end
  ) stored,
  created_at      timestamptz not null default now()
);
create index if not exists idx_ia_reco_bar on ia_recomendaciones_log(bar_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 4. Funciones de aprendizaje
-- -----------------------------------------------------------------------------

-- 4.1 Afinidad: se actualiza en cada cierre de pedido (trigger)
create or replace function fn_ia_afinidad() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'cerrado' and old.estado is distinct from 'cerrado' then
    insert into ia_totales_bar(bar_id, pedidos) values (new.bar_id, 1)
      on conflict (bar_id) do update set pedidos = ia_totales_bar.pedidos + 1;

    insert into ia_frecuencia_productos(bar_id, producto_id, pedidos)
    select distinct new.bar_id, producto_id, 1 from pedido_items
     where pedido_id = new.id and producto_id is not null and estado_cocina <> 'anulado'
    on conflict (bar_id, producto_id) do update set pedidos = ia_frecuencia_productos.pedidos + 1;

    insert into ia_afinidad_productos(bar_id, producto_a, producto_b, coocurrencias)
    select new.bar_id, a.producto_id, b.producto_id, 1
    from (select distinct producto_id from pedido_items where pedido_id = new.id and producto_id is not null and estado_cocina <> 'anulado') a
    join (select distinct producto_id from pedido_items where pedido_id = new.id and producto_id is not null and estado_cocina <> 'anulado') b
      on a.producto_id <> b.producto_id
    on conflict (bar_id, producto_a, producto_b)
      do update set coocurrencias = ia_afinidad_productos.coocurrencias + 1, updated_at = now();
  end if;
  return new;
end $$;

drop trigger if exists trg_ia_afinidad on pedidos;
create trigger trg_ia_afinidad after update of estado on pedidos
for each row execute function fn_ia_afinidad();

-- 4.2 Patrones de demanda: correr tras el cierre de turno (o por pg_cron cada noche)
--     EMA con alpha = 0.3 sobre las ventas de las últimas 24 h por franja.
create or replace function ia_actualizar_patrones(p_bar uuid, p_alpha numeric default 0.3) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  with ventas as (
    select pi.producto_id,
           extract(dow  from pi.creado_at at time zone b.zona_horaria)::smallint as dia,
           extract(hour from pi.creado_at at time zone b.zona_horaria)::smallint as hora,
           sum(pi.cantidad)::numeric as unidades,
           avg(pi.demora_seg)::numeric as prep
    from pedido_items pi join bares b on b.id = pi.bar_id
    where pi.bar_id = p_bar and pi.estado_cocina <> 'anulado' and pi.producto_id is not null
      and pi.creado_at > now() - interval '24 hours'
    group by 1, 2, 3
  )
  insert into ia_patrones_demanda as t (bar_id, producto_id, dia_semana, franja_hora, ventas_prom, ventas_desvio, tiempo_prep_prom_seg, muestras)
  select p_bar, producto_id, dia, hora, unidades, 0, prep, 1 from ventas
  on conflict (bar_id, producto_id, dia_semana, franja_hora) do update set
    ventas_prom = round(p_alpha * excluded.ventas_prom + (1 - p_alpha) * t.ventas_prom, 3),
    ventas_desvio = round(p_alpha * abs(excluded.ventas_prom - t.ventas_prom) + (1 - p_alpha) * t.ventas_desvio, 3),
    tiempo_prep_prom_seg = coalesce(round(p_alpha * excluded.tiempo_prep_prom_seg + (1 - p_alpha) * coalesce(t.tiempo_prep_prom_seg, excluded.tiempo_prep_prom_seg), 1), t.tiempo_prep_prom_seg),
    muestras = t.muestras + 1,
    updated_at = now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 4.3 Sugerencia de compra: proyección de los próximos N días basada en las
--     últimas 8 semanas del MISMO día de la semana, convertida a insumos por receta.
create or replace function ia_sugerencia_compras(p_bar uuid, p_dias int default 4)
returns table (insumo_id uuid, insumo text, unidad text, stock_actual numeric, consumo_proyectado numeric,
               stock_minimo numeric, sugerido numeric, proveedor text)
language sql stable security definer set search_path = public as $$
  with dias as (
    select (current_date + g)::date as d from generate_series(0, p_dias - 1) g
  ),
  hist as (   -- unidades por producto y día de la semana, promedio de 8 semanas
    select pi.producto_id, extract(dow from pi.creado_at)::int as dow,
           sum(pi.cantidad)::numeric / 8 as prom
    from pedido_items pi
    where pi.bar_id = p_bar and pi.estado_cocina <> 'anulado'
      and pi.creado_at >= current_date - interval '56 days'
    group by 1, 2
  ),
  proy as (
    select h.producto_id, sum(h.prom) as unidades
    from dias join hist h on h.dow = extract(dow from dias.d)::int
    group by 1
  ),
  consumo as (
    select r.insumo_id, sum(r.cantidad * p.unidades) as total
    from proy p join recetas r on r.producto_id = p.producto_id
    group by 1
  )
  select i.id, i.nombre, i.unidad, i.stock_actual, round(coalesce(c.total, 0), 2),
         i.stock_minimo,
         greatest(ceil(coalesce(c.total, 0) + i.stock_minimo - i.stock_actual), 0),
         pr.nombre
  from insumos i
  left join consumo c on c.insumo_id = i.id
  left join proveedores pr on pr.id = i.proveedor_id
  where i.bar_id = p_bar and (coalesce(c.total,0) + i.stock_minimo) > i.stock_actual
  order by (i.stock_actual / nullif(coalesce(c.total,0) + i.stock_minimo, 0)) asc nulls last
$$;

-- 4.4 Upselling en tiempo real: los 2 productos con mayor (confianza × margen)
--     dado el carrito actual. confianza(A→B) = co(A,B) / frec(A).
create or replace function ia_upsell(p_bar uuid, p_carrito uuid[], p_limite int default 2)
returns table (producto_id uuid, nombre text, precio numeric, confianza numeric, margen_pct numeric, score numeric)
language sql stable security definer set search_path = public as $$
  with cand as (
    select a.producto_b as pid, max(a.coocurrencias::numeric / nullif(f.pedidos, 0)) as conf
    from ia_afinidad_productos a
    join ia_frecuencia_productos f on f.bar_id = a.bar_id and f.producto_id = a.producto_a
    where a.bar_id = p_bar and a.producto_a = any(p_carrito) and not (a.producto_b = any(p_carrito))
    group by a.producto_b
  )
  select p.id, p.nombre, p.precio_actual, round(c.conf, 3),
         round((1 - costo_receta(p.id) / nullif(p.precio_actual, 0)) * 100, 1),
         round(c.conf * (1 - costo_receta(p.id) / nullif(p.precio_actual, 0)), 4) as score
  from cand c join productos p on p.id = c.pid
  where p.activo and p.eliminado_at is null
  order by score desc nulls last
  limit p_limite
$$;
grant execute on function ia_upsell(uuid, uuid[], int) to anon, authenticated;

-- 4.5 ETA de cocina: carga actual del KDS × velocidad histórica del turno
create or replace function ia_eta_estacion(p_bar uuid, p_estacion estacion_tipo)
returns table (items_en_cola int, demora_prom_turno_seg numeric, eta_nuevo_pedido_min numeric, desvio_vs_historico_pct numeric)
language sql stable security definer set search_path = public as $$
  with cola as (
    select count(*)::int as n from pedido_items
    where bar_id = p_bar and estacion = p_estacion and estado_cocina in ('pendiente','marchando')
  ), turno as (
    select avg(demora_seg)::numeric as seg from pedido_items
    where bar_id = p_bar and estacion = p_estacion and listo_at > now() - interval '3 hours'
  ), hist as (
    select avg(tiempo_prep_prom_seg)::numeric as seg from ia_patrones_demanda d
    join productos p on p.id = d.producto_id
    where d.bar_id = p_bar and p.estacion = p_estacion
      and d.dia_semana = extract(dow from now())::int and d.franja_hora = extract(hour from now())::int
  )
  select cola.n, round(coalesce(turno.seg, hist.seg, 480), 0),
         -- capacidad paralela estimada: 4 ítems a la vez
         round((coalesce(turno.seg, hist.seg, 480) * (1 + cola.n / 4.0)) / 60, 1),
         case when hist.seg > 0 then round((coalesce(turno.seg, hist.seg) - hist.seg) / hist.seg * 100, 1) end
  from cola, turno, hist
$$;

-- 4.6 Medir impacto de una recomendación aplicada (correr 60 min después)
create or replace function ia_medir_impacto(p_reco uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v ia_recomendaciones_log; v_prods uuid[];
begin
  select * into v from ia_recomendaciones_log where id = p_reco;
  if v.decidido_at is null then return; end if;
  select coalesce(array_agg(x::uuid), '{}') into v_prods from jsonb_array_elements_text(coalesce(v.accion->'productos','[]'::jsonb)) x;
  update ia_recomendaciones_log set
    ventas_antes = (select coalesce(sum(cantidad * precio_unitario),0) from pedido_items
                     where bar_id = v.bar_id and (cardinality(v_prods) = 0 or producto_id = any(v_prods))
                       and creado_at between v.decidido_at - interval '60 minutes' and v.decidido_at),
    ventas_despues = (select coalesce(sum(cantidad * precio_unitario),0) from pedido_items
                     where bar_id = v.bar_id and (cardinality(v_prods) = 0 or producto_id = any(v_prods))
                       and creado_at between v.decidido_at and v.decidido_at + interval '60 minutes')
  where id = p_reco;
end $$;

-- -----------------------------------------------------------------------------
-- 5. RLS: solo jefe (y CM para recomendaciones de marketing)
-- -----------------------------------------------------------------------------
alter table ia_patrones_demanda    enable row level security;
alter table ia_afinidad_productos  enable row level security;
alter table ia_frecuencia_productos enable row level security;
alter table ia_totales_bar         enable row level security;
alter table ia_recomendaciones_log enable row level security;

create policy ia_patrones_jefe on ia_patrones_demanda    for select using (tiene_rol(bar_id, array['jefe']::rol_usuario[]));
create policy ia_afinidad_jefe on ia_afinidad_productos  for select using (tiene_rol(bar_id, array['jefe']::rol_usuario[]));
create policy ia_frec_jefe     on ia_frecuencia_productos for select using (tiene_rol(bar_id, array['jefe']::rol_usuario[]));
create policy ia_tot_jefe      on ia_totales_bar          for select using (tiene_rol(bar_id, array['jefe']::rol_usuario[]));
create policy ia_reco_select   on ia_recomendaciones_log  for select using (tiene_rol(bar_id, array['cm']::rol_usuario[]));
create policy ia_reco_update   on ia_recomendaciones_log  for update using (tiene_rol(bar_id, array['cm']::rol_usuario[]));

-- pg_cron sugerido (después de cada cierre nocturno):
-- select cron.schedule('ia-patrones', '30 6 * * *', $$ select ia_actualizar_patrones(id) from bares $$);
