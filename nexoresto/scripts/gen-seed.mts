// Genera supabase/seed.sql a partir del catálogo único (src/lib/store/catalogo.ts).
// Uso: node scripts/gen-seed.mts   (Node 22.18+ ejecuta TypeScript directamente)
import { writeFileSync } from "node:fs";
import { BAR_ID, BAR_SLUG, CATEGORIAS, INSUMOS, MESAS_RAW, MODIFICADORES, PRODUCTOS, RECETAS, SECTORES, mesaId } from "../src/lib/store/catalogo.ts";

const q = (v: unknown) => (v === null || v === undefined ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const rows = (xs: unknown[][]) => xs.map((r) => `  (${r.map(q).join(", ")})`).join(",\n");
const proveedores = [...new Set(INSUMOS.map((i) => i.proveedor))];
const provId = (n: string) => `00000000-0000-4000-8000-${"f0" + String(proveedores.indexOf(n) + 1).padStart(10, "0")}`;

const sql = `-- =============================================================================
--  NEXORESTO · Datos de demostración (GENERADO por scripts/gen-seed.mts — no editar a mano)
--  Bar Central (Santiago del Estero). Ejecutar después de las migraciones.
-- =============================================================================
insert into bares (id, slug, nombre, moneda, estado_licencia, plan, lat, lng, direccion)
values (${q(BAR_ID)}, ${q(BAR_SLUG)}, 'Bar Central', 'ARS', 'activa', 'pro', -27.7834, -64.2642, 'Av. Belgrano 1100, Santiago del Estero')
on conflict (id) do nothing;

insert into categorias (id, bar_id, nombre, orden, estacion) values
${rows(CATEGORIAS.map((c) => [c.id, BAR_ID, c.nombre, c.orden, c.estacion]))}
on conflict (id) do nothing;

insert into productos (id, bar_id, categoria_id, nombre, descripcion, icono, estacion, precio_base, precio_minimo, precio_maximo,
  precio_actual, es_cotizable_bolsa, objetivo_ventana, tiempo_objetivo_min, destacado) values
${rows(PRODUCTOS.map((p) => [p.id, BAR_ID, p.categoria_id, p.nombre, p.descripcion, p.icono, p.estacion, p.precio_base, p.precio_minimo, p.precio_maximo, p.precio_actual, p.es_cotizable_bolsa, p.objetivo_ventana, p.tiempo_objetivo_min, p.destacado]))}
on conflict (id) do nothing;

insert into proveedores (id, bar_id, nombre) values
${rows(proveedores.map((n) => [provId(n), BAR_ID, n]))}
on conflict (id) do nothing;

insert into insumos (id, bar_id, nombre, rubro, unidad, stock_actual, stock_minimo, costo_unitario, proveedor_id) values
${rows(INSUMOS.map((i) => [i.id, BAR_ID, i.nombre, i.rubro, i.unidad, i.stock_actual, i.stock_minimo, i.costo_unitario, provId(i.proveedor)]))}
on conflict (id) do nothing;

insert into recetas (bar_id, producto_id, insumo_id, cantidad) values
${rows(RECETAS.map((r) => [BAR_ID, r.producto_id, r.insumo_id, r.cantidad]))}
on conflict (producto_id, insumo_id) do nothing;

insert into modificadores (id, bar_id, producto_id, categoria_id, grupo, nombre, precio_extra, exclusivo) values
${rows(MODIFICADORES.map((m) => [m.id, BAR_ID, m.producto_id, m.categoria_id, m.grupo, m.nombre, m.precio_extra, m.exclusivo]))}
on conflict (id) do nothing;

insert into sectores (id, bar_id, nombre, orden) values
${rows(SECTORES.map((s) => [s.id, BAR_ID, s.nombre, s.orden]))}
on conflict (id) do nothing;

insert into mesas (id, bar_id, sector_id, numero, capacidad) values
${rows(MESAS_RAW.map(([n, s, cap]) => [mesaId(n), BAR_ID, SECTORES[s - 1].id, n, cap]))}
on conflict (id) do nothing;

insert into eventos (bar_id, titulo, subtitulo, descripcion, fecha, estado) values
  (${q(BAR_ID)}, 'DJ Nahuel', 'Deep house', 'Set de 4 horas en la terraza', date_trunc('day', now()) + interval '2 days 23 hours', 'publicado'),
  (${q(BAR_ID)}, 'Los del Río', 'Rock en vivo', 'Banda en vivo, entrada libre', date_trunc('day', now()) + interval '3 days 22 hours 30 minutes', 'publicado'),
  (${q(BAR_ID)}, 'Noche de Tapas', '2×1 en picadas', 'Todas las picadas 2×1', date_trunc('day', now()) + interval '8 days 20 hours', 'programado');

insert into promociones (bar_id, titulo, tipo, descuento_pct, categoria_id, dias, hora_desde, hora_hasta, activa) values
  (${q(BAR_ID)}, 'Happy Hour · Tragos −20 %', 'happy_hour', 20, ${q(CATEGORIAS[0].id)}, '{1,2,3,4}', '19:00', '21:00', true),
  (${q(BAR_ID)}, '2×1 en cervezas', '2x1', 50, ${q(CATEGORIAS[1].id)}, '{5}', '18:00', '20:00', true);

-- -----------------------------------------------------------------------------
-- Usuarios: crealos en Supabase → Authentication → Add user (email + contraseña)
-- y después vinculá cada uno con su perfil y su PIN, por ejemplo:
--
-- insert into perfiles_usuarios (id, bar_id, nombre, rol, pin_hash)
-- values ('<uuid de auth.users>', ${q(BAR_ID)}, 'Valeria Ruiz', 'jefe', crypt('1111', gen_salt('bf', 8)));
-- -----------------------------------------------------------------------------
`;
writeFileSync(new URL("../supabase/seed.sql", import.meta.url), sql);
console.log("supabase/seed.sql generado:", PRODUCTOS.length, "productos,", INSUMOS.length, "insumos,", RECETAS.length, "líneas de receta");
