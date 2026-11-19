-- Prueba de humo de la lógica de negocio en SQL (se ejecuta con tests/sql/run.sh)
\set ON_ERROR_STOP 1
insert into auth.users(id, email) values ('00000000-0000-4000-8000-ee0000000001', 'jefe@demo.local');
insert into perfiles_usuarios(id, bar_id, nombre, rol) values ('00000000-0000-4000-8000-ee0000000001', '00000000-0000-4000-8000-00000000b001', 'Valeria', 'jefe');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-ee0000000001', false);
select fijar_pin('00000000-0000-4000-8000-ee0000000001', '1111');
select count(*) = 1 as pin_ok from verificar_pin('00000000-0000-4000-8000-00000000b001', '1111');

do $$
declare
  bar uuid := '00000000-0000-4000-8000-00000000b001';
  mojito uuid := '00000000-0000-4000-8000-ab0000000001';
  burger uuid := '00000000-0000-4000-8000-ab0000000009';
  mesa uuid := '00000000-0000-4000-8000-ae0000000006';
  ron_antes numeric; ron_despues numeric; v_ped uuid; v_ped2 uuid; v_turno uuid; r jsonb; v_precio numeric; v_crash uuid;
begin
  select stock_actual into ron_antes from insumos where nombre = 'Ron blanco';
  v_ped := crear_pedido(bar, 'salon', mesa,
    jsonb_build_array(jsonb_build_object('producto_id', mojito, 'cantidad', 3),
                      jsonb_build_object('producto_id', burger, 'cantidad', 2, 'modificadores', '[{"grupo":"Extras","nombre":"Extra cheddar","precio_extra":600}]'::jsonb)),
    'idem-1');
  -- idempotencia
  v_ped2 := crear_pedido(bar, 'salon', mesa, '[{"producto_id":"00000000-0000-4000-8000-ab0000000001","cantidad":1}]', 'idem-1');
  assert v_ped = v_ped2, 'idempotencia de pedidos';
  select stock_actual into ron_despues from insumos where nombre = 'Ron blanco';
  assert ron_antes - ron_despues = 150, format('stock ron: %s → %s', ron_antes, ron_despues);
  assert (select subtotal from pedidos where id = v_ped) = 3*3800 + 2*(7900+600), 'subtotal con extras';
  assert (select estado from mesas where id = mesa) = 'esperando', 'mesa esperando';

  -- KDS
  perform cambiar_estado_item((select id from pedido_items where pedido_id = v_ped and estacion = 'barra'), 'marchando');
  perform despachar_comanda(v_ped, 'barra');
  perform despachar_comanda(v_ped, 'cocina');
  assert (select estado from pedidos where id = v_ped) = 'listo', 'pedido listo';

  -- Exchange: 3 mojitos con objetivo 2 → +1 % → 3850
  perform exchange_tick(bar);
  select precio_actual into v_precio from productos where id = mojito;
  assert v_precio = 3850, format('exchange mojito = %s', v_precio);

  -- Market crash
  v_crash := lanzar_market_crash(bar, array[mojito], 'Crash test', 10);
  assert (select precio_actual from productos where id = mojito) = 2850, 'crash al mínimo';
  perform exchange_tick(bar);
  assert (select precio_actual from productos where id = mojito) = 2850, 'motor no toca productos en crash';
  perform finalizar_market_crash(v_crash);
  assert (select precio_actual from productos where id = mojito) = 3850, 'crash restaura precio';

  -- Caja: pago multipago idempotente y arqueo ciego
  v_turno := abrir_turno(bar, 'Caja 1', 10000);
  r := registrar_pago(v_ped, v_turno, '[{"medio":"efectivo","monto":15000},{"medio":"qr","monto":13400}]', 2000, 'pay-1');
  assert (r->>'cerrado')::boolean, 'pedido cerrado tras pago: ' || r::text;
  r := registrar_pago(v_ped, v_turno, '[{"medio":"efectivo","monto":15000}]', 0, 'pay-1');
  assert (r->>'duplicado')::boolean, 'pago duplicado detectado';
  assert (select estado from mesas where id = mesa) = 'libre', 'mesa liberada';
  r := cerrar_turno(v_turno, '{"efectivo":26800,"qr":13400}');
  assert (r->>'diferencia')::numeric = -200, 'arqueo ciego diferencia = ' || r::text;

  -- IA: afinidad registrada al cerrar el pedido
  assert (select coocurrencias from ia_afinidad_productos where producto_a = mojito and producto_b = burger) = 1, 'afinidad';
  assert (select count(*) from ia_upsell(bar, array[mojito])) = 1, 'upsell';
  perform ia_actualizar_patrones(bar);
  assert (select count(*) from ia_patrones_demanda where bar_id = bar) >= 2, 'patrones';
  assert (select count(*) from ia_sugerencia_compras(bar)) > 0, 'sugerencia de compras (hay insumos bajo mínimo)';

  -- Social
  insert into fotos_clientes(bar_id, mesa_id, url_foto, sesion_cliente, estado) values (bar, mesa, 'x.jpg', 'ses-a', 'aprobada');
  perform votar_foto((select id from fotos_clientes limit 1), 'ses-b');
  begin
    perform votar_foto((select id from fotos_clientes limit 1), 'ses-b');
    raise exception 'debió fallar el doble voto';
  exception when others then
    if sqlerrm not like 'Ya votaste%' then raise; end if;
  end;
  r := cerrar_votacion(bar);
  assert r->>'cupon' like 'FOTO-%', 'cupón ganador ' || r::text;

  -- Reservas superpuestas
  insert into reservas(bar_id, mesa_id, nombre, personas, inicio) values (bar, mesa, 'Gómez', 4, now() + interval '1 day');
  begin
    insert into reservas(bar_id, mesa_id, nombre, personas, inicio) values (bar, mesa, 'Pérez', 2, now() + interval '1 day 30 minutes');
    raise exception 'debió fallar la superposición';
  exception when exclusion_violation then null;
  end;
  raise notice 'SMOKE OK';
end $$;
