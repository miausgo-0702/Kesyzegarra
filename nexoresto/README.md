# NEXORESTO · Gastronomía en tiempo real

SaaS gastronómico todo-en-uno (POS, mozos, KDS/BDS, delivery GPS, carta QR social, CM, dashboard e IA) con un diferencial: **precios dinámicos tipo bolsa** y una **pantalla NYSE** para el salón.

Stack: **Next.js 15 (App Router) · TypeScript · Tailwind · Lucide · Recharts · Leaflet · Supabase (Postgres + RLS + Realtime + Storage) · Claude API**.

---

## Probarlo en 1 minuto (modo demo, sin base de datos)

```bash
cd nexoresto
npm install
npm run dev          # http://localhost:3000
```

Sin variables de entorno, la app funciona **en el navegador** (datos guardados en el equipo y sincronizados entre pestañas): abre en el ingreso por PIN y cada rol entra directo a su pantalla. El bar de ejemplo trae una noche de servicio cargada; los bares nuevos arrancan con la carta vacía.

- **Cada bar tiene su carta**: categorías (crear, renombrar, ordenar, borrar), productos con foto propia (subir o arrastrar), precio y rango del Exchange, receta, opciones/modificadores, agotado, destacado en TV, duplicar y archivar.
- **Mesas y QR**: sectores, mesas y hoja de QR por mesa para imprimir.
- **Equipo**: personas, rol y PIN único de 4 dígitos.
- **Mi bar**: nombre, dirección, propina sugerida y reglas de precios.
- **Varios bares**: el Super Admin crea bares y entra a cada uno; cada dispositivo elige su bar en el ingreso.
- El motor Exchange corre con la ventana del bar (15 min). Los clientes simulados (mercado acelerado) se activan desde Super Admin → APIs y backups → Herramientas de prueba.

| Rol | PIN demo | Pantalla |
|---|---|---|
| Dueño / Gerente | `1111` | `/admin/dashboard`, `/admin/stock`, `/admin/auditoria` |
| Caja | `2222` | `/pos/caja`, `/pos/reservas`, `/pos/delivery` |
| Mozo | `3333` | `/pos/salon` |
| Cocina | `4444` | `/kds/cocina` |
| Bartender | `5555` | `/kds/barra` |
| Community Manager | `6666` | `/cm` |
| Cadete | `7777` | `/cadete` |
| Super Admin | `9999` | `/superadmin` |
| Público | — | `/tv/bar-central`, `/menu/bar-central/12`, `/menu/bar-central/delivery` |

La sesión es **por pestaña**: podés tener caja, cocina y salón abiertos a la vez con usuarios distintos.

---

## Puesta en producción (Fase 0 → deploy)

1. **Supabase** → nuevo proyecto → *SQL Editor* → ejecutá en orden:
   1. `supabase/migrations/0001_nucleo.sql` (tablas, RLS, triggers, RPC, vistas, Realtime, Storage)
   2. `supabase/migrations/0002_ia.sql` (memoria y aprendizaje de la IA)
   3. `supabase/migrations/0003_operacion.sql` (agotados "86", mover/unir mesas, reportes de cierre Z)
   4. `supabase/seed.sql` (bar de ejemplo con carta, recetas, insumos y mesas)
2. **Usuarios**: *Authentication → Add user* (email + contraseña) para cada empleado y vinculalo:
   ```sql
   insert into perfiles_usuarios (id, bar_id, nombre, rol, pin_hash)
   values ('<uuid de auth.users>', '00000000-0000-4000-8000-00000000b001', 'Valeria Ruiz', 'jefe', crypt('1111', gen_salt('bf', 8)));
   ```
3. **Motor Exchange cada 15 min**: o bien `pg_cron` (bloque comentado al final de `0001_nucleo.sql`), o bien el cron de Vercel que ya está en `vercel.json` (`/api/exchange/tick`, protegido con `CRON_SECRET`).
4. **Vercel** → importá el repo con *Root Directory* = `nexoresto` y cargá las variables de `.env.example`:

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Conexión del navegador (activa el modo producción) |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor: login por PIN y cron del Exchange |
| `NEXT_PUBLIC_DEFAULT_BAR_SLUG` | Bar al que queda vinculado el dispositivo (default `bar-central`) |
| `ANTHROPIC_API_KEY` | Copiloto IA (sin clave responde en modo local con las mismas herramientas) |
| `NEXORESTO_AI_MODEL` | Opcional, default `claude-opus-5-5` |
| `CRON_SECRET` | Autoriza `/api/exchange/tick` |
| `NEXT_PUBLIC_MAP_TILES` | Opcional: tiles propios (Mapbox/MapTiler). Default OpenStreetMap con filtro oscuro |

---

## Qué hay en cada fase

| Fase | Entregable | Archivos |
|---|---|---|
| 1 · Arquitectura y BD | Multi-tenant (`bares`), RBAC con PIN bcrypt y bloqueo, catálogo + escandallos, salón y reservas (sin superposición por *exclusion constraint*), pedidos/KDS con timestamps, caja con arqueo ciego, delivery GPS, social, RLS, trigger de stock al confirmar, RPCs con idempotencia | `supabase/migrations/0001_nucleo.sql`, `supabase/seed.sql` |
| 2 · Exchange + TV | Motor puro y testeado (± 3 %/ventana, redondeo $50, piso = máx(mínimo, costo × 1,35), tope), `triggerMarketCrash()` con restauración automática; pantalla NYSE con reloj gigante, 4 gráficos estrella, cotizaciones, muro social, QR y ticker | `src/lib/exchangeEngine.ts`, `src/app/tv/[barId]/page.tsx` |
| 3 · KDS / BDS | Semáforo 10/18 min con parpadeo y sonido, agrupador de producción, optimistic UI, despacho con aviso al mozo y registro de demora, insignia de Crash, recetas a la vista en barra, stock crítico | `src/app/kds/[estacion]/page.tsx` |
| 4 · POS, mozos, delivery | Mapa de mesas por sector, comanda táctil con buscador, modificadores, comensal, precio congelado, upsell IA, división de cuenta; caja multipago + propina + cupón + división + ticket; arqueo ciego; reservas con asignación automática y WhatsApp; delivery con Leaflet, cadete con `watchPosition`, seguimiento público | `src/app/pos/*`, `src/app/cadete`, `src/app/seguimiento/[token]`, `src/components/pos`, `src/components/delivery` |
| 5 · WebApp QR + CM | Carta mobile-first con cotización en vivo, carrito con precio congelado y confirmación, delivery, "Subí tu foto y ganá" (compresión en el navegador), votación 1 por ronda, cupón ganador con QR, cartelera; CM con moderación 1 clic, botón rojo de Market Crash, eventos con flyer, promos y cierre de votación | `src/app/menu/[barId]/[mesaId]/page.tsx`, `src/app/cm/page.tsx` |
| 6 · Dashboard + Super Admin | KPIs con **ganancia neta real** (ventas − costo de receta − mermas), ventas por hora/horas pico, rentabilidad, alertas, stock con compras/mermas y costo promedio ponderado, auditoría y reversión de precios, exportación **Excel/CSV**; panel del programador con bares/licencias, reglas del Exchange versionadas + simulador, logs y estado de APIs | `src/app/admin/*`, `src/app/superadmin/page.tsx`, `src/lib/exportar.ts` |
| 7 · IA | Tablas de patrones (EMA por producto/día/franja), afinidad (market basket por trigger al cerrar pedidos), log de recomendaciones con impacto medido; motor de compras (8 semanas mismo día), upsell (confianza × margen), ETA de cocina y anomalías; copiloto Claude con *tool use* de solo lectura y acciones que se confirman con un clic | `supabase/migrations/0002_ia.sql`, `src/lib/ai/learningEngine.ts`, `src/lib/ai/copilotTools.ts`, `src/app/api/ai-copilot/route.ts`, `src/components/ai/AiAssistantPanel.tsx` |

| Mejoras operativas | **Carta y precios** (rango del Exchange, receta con costo y piso real, foto, destacados), **agotado "86"** y disponibilidad automática por stock de insumos en POS, carta QR y TV; **venta rápida de mostrador**; **mover y unir mesas**; **reportes** (cierre Z por medio de pago, ventas por mozo y categoría, impacto del Exchange vs. precio base); **cola offline** con indicador de conexión | `src/app/admin/carta`, `src/app/admin/reportes`, `supabase/migrations/0003_operacion.sql`, `src/lib/store/supabaseBackend.ts` |

### Diseño

- Fotografías reales de cada producto y del salón en `public/fotos` (Unsplash, licencia de uso comercial libre; detalle en `public/fotos/CREDITOS.md`). Si una foto falla, se usa la ilustración vectorial.
- Movimiento con curvas de salida rápidas (`cubic-bezier(0.23, 1, 0.32, 1)`), 150–260 ms, escala 0,97 al presionar, hojas modales que suben desde abajo en el celular.
- Estados completos: foco visible, selección, scrollbars y cursor con la paleta, esqueletos de carga, toasts con ícono, agotado, sin conexión.
- Íconos de Lucide en lugar de emojis en toda la interfaz.

---

## Estructura

```
nexoresto/
├─ supabase/
│  ├─ migrations/0001_nucleo.sql     # tablas, RLS, triggers, RPC, vistas, realtime
│  ├─ migrations/0002_ia.sql         # memoria y aprendizaje de la IA
│  └─ seed.sql                       # GENERADO desde src/lib/store/catalogo.ts
├─ src/
│  ├─ app/
│  │  ├─ page.tsx · login/           # lanzador y PIN
│  │  ├─ tv/[barId]/                 # pantalla pública NYSE
│  │  ├─ kds/[estacion]/             # cocina y barra
│  │  ├─ pos/salon|caja|reservas|delivery/
│  │  ├─ cadete/ · seguimiento/[token]/
│  │  ├─ menu/[barId]/[mesaId]/      # WebApp QR y delivery
│  │  ├─ cm/ · admin/dashboard|stock|auditoria/ · superadmin/
│  │  └─ api/ai-copilot · auth/pin · exchange/tick · health
│  ├─ components/ ui · pos · delivery · ai · icons
│  └─ lib/
│     ├─ exchangeEngine.ts           # motor de precios (puro, testeado)
│     ├─ ai/                         # aprendizaje estadístico + herramientas del copiloto
│     ├─ store/                      # backend demo / Supabase con la misma interfaz
│     └─ supabase/                   # clientes navegador y servidor
├─ scripts/gen-seed.mts              # node scripts/gen-seed.mts
└─ tests/                            # vitest + smoke SQL (tests/sql/run.sh)
```

**Una sola fuente de verdad, dos backends.** Todas las pantallas despachan *acciones* (`src/lib/store/actions.ts`). En modo demo un reductor las aplica en el navegador; con Supabase se traducen a **RPCs** que validan permisos y reglas en Postgres (`crear_pedido`, `registrar_pago`, `cerrar_turno`, `lanzar_market_crash`, `votar_foto`, `cerrar_votacion`, `actualizar_gps`…). La interfaz no cambia.

## Calidad y verificación

```bash
npm test                 # 20 tests: motor Exchange (reproduce la tabla de la propuesta) + reductor
npm run typecheck
npm run build
tests/sql/run.sh         # aplica migraciones + seed en un Postgres local y corre asserts de negocio
```

El smoke SQL verifica: idempotencia de pedidos y pagos, descuento de stock por receta, totales con extras, flujo KDS, tick del Exchange, Market Crash y restauración, arqueo ciego, afinidad/upsell/patrones de IA, voto único, cupón ganador y reservas superpuestas.

## Pendiente / a definir con el bar piloto

- **Service Worker** para abrir la app sin conexión desde cero: la cola offline de acciones ya funciona con la app abierta.
- **Pasarela de pagos QR, facturación electrónica ARCA e impresora térmica**: integraciones a elegir según proveedor.
- **Realtime filtrado por estación**: hoy el adaptador de Supabase escucha el canal del bar y refresca el snapshot; para bares grandes conviene un canal por estación.
- El filtro automático de fotos es un marcador (`filtro_auto`): la moderación real la hace el CM.
