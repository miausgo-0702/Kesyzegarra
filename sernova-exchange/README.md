# SERNOVA EXCHANGE

Terminal de consumo para bar: registra los tragos servidos por mesa y mueve su precio como en un exchange (subidas ▲, bajadas ▼, gráfico, ticker, ranking, cuenta y panel de administrador), con pantalla en vivo para televisores.

## Inicio rápido

1. Ejecutá **`INICIAR.bat`** (Windows), **`start.sh`** (macOS/Linux) o `npm start` (requiere Node 16+).
2. Abrí `http://localhost:8765/` en la terminal y `http://localhost:8765/tv.html` en cada TV.
   La consola del servidor muestra también la dirección de red local (`http://192.168.x.x:8765/tv.html`) y la **clave de publicación**.
3. Elegí la mesa, comensales y responsable → **Abrir mesa y empezar**.

También funciona abriendo `index.html` directamente (sin TVs en red).

## Uso diario

- **+ Registrar** suma 1 unidad; **Cantidad** abre el detalle (atajos ×2, ×3, ×4, ×6, ×10, flechas y Enter).
- Cada registro muestra un aviso con **Deshacer**. También `Ctrl+Z`.
- En la búsqueda, si queda un solo trago, **Enter** lo registra.
- **Ver cuenta / cerrar mesa**: detalle agrupado, propina (0/10/15/20 %), división por persona, ahorro vs. carta, **imprimir ticket** (formato 72 mm), CSV y **cobrar y cerrar** (archiva y vuelve a elegir mesa).
- Orden de carta: carta, nombre, precio, más consumido, **mejor oportunidad** (más barato vs. carta) y **mayores subas**. Vista en tarjetas o lista compacta.
- Panel **Movimientos**: los tragos más caros y las mejores oportunidades frente a la carta.

### Atajos

| Tecla | Acción |
| --- | --- |
| `/` | Buscar trago |
| `Ctrl+Z` | Deshacer último consumo |
| `C` | Ver cuenta |
| `G` | Ir al gráfico |
| `A` | Panel de administrador |
| `T` | Tema oscuro / claro |
| `?` | Ayuda de atajos |
| `Esc` | Cerrar diálogos |

## Modelo de precios

- **Más consumo ⇒ más sube**: la presión compradora crece con las unidades vendidas en los últimos 4 minutos.
- **Sin consumo ⇒ baja** en cada ajuste automático (cada 20 s por defecto).
- **Caída general** periódica (−10 % cada 2 min por defecto), con cuenta regresiva y aviso.
- **Subida general** manual desde el admin (+7 % por defecto).
- Todo es configurable en **Admin → Mercado → Reglas del mercado**. Al **pausar**, también se congela la cuenta regresiva.

## Pantalla de televisores

- Precio destacado gigante con gráfico, rotación cada 12 s (barra de progreso), consumo de la mesa, frente a la carta, ranking, últimos movimientos y toda la carta con destellos al cambiar.
- **Cuenta regresiva final** a pantalla completa en los últimos 5 s y **animación de caída/subida general**.
- Corrige la diferencia de reloj con el servidor, mantiene la pantalla encendida (Wake Lock), oculta el cursor y muestra *SIN SEÑAL* si se corta la conexión.
- Teclas: `F` o doble clic = pantalla completa; `←` `→` = cambiar trago.

## Administrador

Botón **Admin** (o tecla `A`). El usuario y la clave iniciales los entrega el responsable del local; cambialos en *Acceso*. Las credenciales no aparecen en la pantalla ni en el código (se guardan solo como hash).

- **Mercado**: estado, índice vs. carta, pausar/reanudar, caída/subida forzada, restablecer precios, cerrar mesa, reglas (intervalos y porcentajes).
- **Carta y precios**: fijar precio actual, ±5 %, precio base, activar/desactivar, crear y eliminar tragos propios, filtro.
- **Mesas**: archivo de mesas, ver detalle, restaurar, borrar, exportar todo a CSV.
- **Reportes**: facturación de la jornada, mesas, ticket medio, propinas, ventas por hora, tragos más vendidos y por responsable.
- **Sistema**: datos de la mesa, control de TV, sincronización (clave), **respaldo JSON** (descargar/importar), tema, registro de acciones y borrado total.
- **Acceso**: cambiar contraseña (pide la actual) y usuario, cerrar sesión.

## Seguridad y sistema

- La contraseña se guarda como **SHA‑256 con sal e iteraciones** (las claves antiguas se migran solas al ingresar).
- La sesión admin vive en `sessionStorage` y **expira tras 30 min** de inactividad; **5 intentos fallidos bloquean 60 s**.
- Los datos de administrador **nunca** se envían al servidor ni a la TV (solo el estado público del mercado).
- El servidor: bloquea `data/`, archivos ocultos y de código, evita *path traversal*, comprime con gzip, usa ETag y cabeceras de seguridad, agrupa los envíos a las TVs y guarda a disco sin bloquear.
- **Publicar desde otro equipo** de la red requiere la clave que muestra el servidor (*Admin → Sistema → Sincronización*). Desde la misma computadora se carga sola. `SERNOVA_OPEN=1` desactiva la clave; `SERNOVA_PORT` cambia el puerto.
- Si el almacenamiento del navegador se llena, se recorta historial y archivo automáticamente.

> El acceso admin es una protección local de demostración: no reemplaza un sistema de cobro ni protege datos reales.

## Archivos

- `index.html` / `styles.css` — terminal (tema oscuro/claro, responsive con barra inferior en móvil, impresión de ticket).
- `tv.html` / `tv.css` — pantalla de televisores (escala de 768p a 4K).
- `server.js` — servidor estático + API de sincronización (`/api/state`, `/api/stream`, `/api/key`, `/api/health`).
- `js/data.js` — carta, categorías, etiquetas y formatos.
- `js/sync.js` — publicación con debounce, clave y estado de conexión; suscripción SSE/polling/local.
- `js/store.js` — persistencia, motor de demanda, eventos, seguridad admin, cuenta, reportes y respaldo.
- `js/chart.js` — gráfico SVG suavizado, media móvil, tooltip táctil y sparklines.
- `js/app.js` — interfaz de la terminal y panel de administrador.
- `js/tv.js` — render en vivo de la TV.
