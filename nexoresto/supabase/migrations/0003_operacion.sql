-- =============================================================================
--  NEXORESTO · 0003 · Mejoras operativas
--   · "86" (agotado) por producto, y disponibilidad automática por stock de insumos
--   · mover / unir mesas con auditoría
--   · venta rápida de mostrador (crear_pedido ya admite p_mesa null)
-- =============================================================================

alter table productos add column if not exists agotado boolean not null default false;

-- Disponible = activo, no marcado agotado y con stock para todos sus insumos
create or replace function producto_disponible(p_producto uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select p.activo and not p.agotado and p.eliminado_at is null
       and not exists (
         select 1 from recetas r join insumos i on i.id = r.insumo_id
          where r.producto_id = p.id and i.stock_actual < r.cantidad)
    from productos p where p.id = p_producto), false)
$$;

-- La carta pública informa disponibilidad (la carta QR muestra "Agotado" en vez de ocultar)
create or replace view v_carta_publica as
  select p.id, p.bar_id, p.categoria_id, c.nombre as categoria, p.nombre, p.descripcion, p.icono, p.imagen_url,
         p.estacion, p.precio_actual, p.precio_anterior, p.precio_base, p.variacion_porcentaje,
         p.es_cotizable_bolsa, p.destacado, producto_disponible(p.id) as disponible
  from productos p left join categorias c on c.id = p.categoria_id
  where p.activo and p.eliminado_at is null;
grant select on v_carta_publica to anon, authenticated;

-- crear_pedido rechaza productos agotados (se redefine solo el control previo)
create or replace function fn_bloquear_agotados() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from productos where id = new.producto_id and agotado) then
    raise exception '% está agotado', new.nombre;
  end if;
  return new;
end $$;
drop trigger if exists trg_items_agotados on pedido_items;
create trigger trg_items_agotados before insert on pedido_items
for each row execute function fn_bloquear_agotados();

-- Marcar / desmarcar agotado (cocina, barra o jefe)
create or replace function marcar_agotado(p_producto uuid, p_agotado boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v productos;
begin
  select * into v from productos where id = p_producto;
  if not tiene_rol(v.bar_id, array['cocina','bartender','caja']::rol_usuario[]) then raise exception 'Sin permiso'; end if;
  update productos set agotado = p_agotado where id = p_producto;
  insert into auditoria(bar_id, usuario_id, accion, tipo, entidad_id, detalle)
  values (v.bar_id, auth.uid(), 'agotado', 'operacion', p_producto::text, jsonb_build_object('producto', v.nombre, 'agotado', p_agotado));
end $$;

-- Mover o unir mesas: los pedidos abiertos pasan a la mesa destino
create or replace function mover_mesa(p_origen uuid, p_destino uuid) returns int
language plpgsql security definer set search_path = public as $$
declare o mesas; d mesas; n int;
begin
  select * into o from mesas where id = p_origen for update;
  select * into d from mesas where id = p_destino for update;
  if o.id is null or d.id is null or o.bar_id <> d.bar_id then raise exception 'Mesa inexistente'; end if;
  if not tiene_rol(o.bar_id, array['mozo','caja']::rol_usuario[]) then raise exception 'Sin permiso'; end if;
  update pedidos set mesa_id = d.id where mesa_id = o.id and estado not in ('cerrado','anulado');
  get diagnostics n = row_count;
  if n = 0 then raise exception 'La mesa de origen no tiene pedidos abiertos'; end if;
  update mesas set estado = case when d.estado in ('libre','reservada') then o.estado else d.estado end,
                   mozo_id = coalesce(d.mozo_id, o.mozo_id), ocupada_desde = coalesce(d.ocupada_desde, o.ocupada_desde)
   where id = d.id;
  update mesas set estado = 'libre', mozo_id = null, ocupada_desde = null where id = o.id;
  insert into auditoria(bar_id, usuario_id, accion, tipo, detalle)
  values (o.bar_id, auth.uid(), 'mover_mesa', 'operacion', jsonb_build_object('origen', o.numero, 'destino', d.numero, 'pedidos', n));
  return n;
end $$;

-- Reportes de cierre (Z) por medio de pago y por mozo
create or replace view v_cierre_por_medio with (security_invoker = true) as
  select mc.bar_id, mc.turno_id, mc.medio, sum(mc.monto) filter (where mc.tipo = 'cobro') as cobrado,
         sum(mc.monto) filter (where mc.tipo = 'propina') as propinas, count(*) filter (where mc.tipo = 'cobro') as operaciones
  from movimientos_caja mc group by mc.bar_id, mc.turno_id, mc.medio;

create or replace view v_ventas_por_mozo with (security_invoker = true) as
  select p.bar_id, date_trunc('day', p.created_at) as dia, p.mozo_id, count(*) as pedidos,
         sum(p.subtotal - p.descuento) as ventas, sum(p.propina) as propinas
  from pedidos p where p.estado <> 'anulado' and p.mozo_id is not null
  group by p.bar_id, date_trunc('day', p.created_at), p.mozo_id;
