# SERNOVA EXCHANGE

Terminal de consumo para bar: registra los tragos servidos por mesa y muestra el precio como en un exchange (subidas ▲, bajadas ▼, gráfico, ticker, ranking y panel de administrador).

## Cómo usarlo

Si descargaste el ZIP: descomprimilo y ejecutá **`INICIAR.bat`** (Windows), **`start.sh`** (macOS/Linux) o `npm start`. Luego abrí `http://localhost:8765/index.html`.

1. Para usar **solo la terminal**, abrí `index.html` en un navegador (no requiere instalación). Para **transmitir en televisores**, iniciá el servidor con `node server.js` y abrí `http://localhost:8765/index.html`.
2. Al iniciar, **elegí la mesa** (1–24) o escribí un nombre personalizado, indicá comensales y responsable, y tocá **Abrir mesa y empezar**.
   - Si ya existe una sesión guardada para esa mesa, podés **Continuar sesión guardada** o empezar una nueva (la anterior queda archivada).
3. En la carta, tocá **+ Registrar** para sumar 1 unidad o **Detalle** para elegir cantidad (hasta 30).
4. Cada registro suma el trago al ticket y mueve su precio según la demanda.
5. El tema oscuro/claro se cambia con el botón del encabezado o la tecla `T`.
6. El ticket permite deshacer, quitar consumos, vaciarlo y exportar a CSV.

## Modelo de precios (demanda real)

- **Más consumo ⇒ más sube**: cada unidad vendida en los últimos 4 minutos aumenta la presión compradora del trago. Registrar 1, 2 o 5 tragos seguidos genera subidas progresivamente mayores.
- **Menos consumo ⇒ baja**: cada 20 segundos el mercado se ajusta. Los tragos sin consumo en la ventana bajan; los que tienen demanda suben, en proporción a sus unidades.
- **Caída general**: cada 2 minutos (hay cuenta regresiva en la barra superior) **todos los precios bajan un 10% a la vez**, con banner rojo y marcas en el gráfico. También puede forzarla el administrador.
- **Subida general**: evento admin que eleva todos los precios un 7%.
- El precio de carta se muestra como línea de referencia dorada («CARTA») en el gráfico.

## Gráfico

- Línea de precio, media móvil de 5 períodos (dorada) y área de tendencia.
- Barras por tipo de evento: consumo (verde/rojo), ajuste automático (azul), caída general (rojo), subida general y ajustes admin (dorado).
- Modo **Demanda** para visualizar las unidades consumidas por ventana.
- Vistas *Precio + consumo*, *Solo precio*, *Solo consumo*, *Demanda*; rangos *Últimos 10*, *Sesión* y *Todo*.
- Tooltip con crosshair: tipo de evento, hora, precio, unidades y demanda.

## Pantalla de televisores

- Abrí **`tv.html`** en cada TV (o `http://<IP-de-la-computadora>:8765/tv.html` desde otro dispositivo de la misma red).
- La pantalla muestra en grande: mesa, cuenta regresiva de la próxima caída, ticker, trago destacado con su gráfico, total consumido, ranking, últimos movimientos y todos los precios.
- Se actualiza **en tiempo real** porque la terminal publica cada cambio en `/api/state` y la TV escucha `/api/stream`. Si el servidor no está disponible, usa el `localStorage` del mismo navegador.
- El trago destacado rota automáticamente cada 12 s. El administrador puede fijar uno o detener la rotación en **Admin → Sistema → Pantalla de televisores**.
- Botón **TV** en el encabezado (y en la pantalla de inicio) abre la pantalla; tecla `F` la pone a pantalla completa.

## Usuario administrador

Botón **Admin** en el encabezado.

- **Usuario:** `julianp` · **Clave:** `070226` (cambiable desde *Acceso*; se guarda como hash en el dispositivo).
- **Mercado:** pausar/reanudar ajustes, forzar caída general, forzar subida general, restablecer precios y cerrar/archivar la mesa.
- **Carta y precios:** fijar precio actual, editar precio base, activar/desactivar tragos, crear tragos personalizados, ajustes rápidos ±5% y restaurar la carta original.
- **Mesas / archivo:** ver la sesión activa, consultar mesas archivadas, restaurar una mesa como sesión activa, borrar registros o vaciar el archivo.
- **Sistema:** forzar tema oscuro/claro, editar mesa/comensales/responsable en vivo, configurar los intervalos de ajuste y caída, controlar la TV y borrar todos los datos.
- **Acceso:** cambiar contraseña y cerrar la sesión admin.

> El acceso admin es una demo local: no está pensado para producción ni para proteger datos reales.

## Atajos

| Tecla | Acción |
| --- | --- |
| `/` | Buscar trago |
| `T` | Cambiar tema oscuro / claro |
| `Esc` | Cerrar diálogo de registro o panel admin |

## Archivos

- `index.html` — estructura de pantallas y panel admin.
- `styles.css` — tema oscuro/claro, gráfico y diseño responsive.
- `tv.html` / `tv.css` — pantalla de televisores.
- `server.js` — servidor estático + API de sincronización para la TV.
- `js/data.js` — carta, categorías, etiquetas y formato monetario.
- `js/sync.js` — publicación/suscripción del estado entre terminal y TV.
- `js/store.js` — persistencia, motor de demanda, eventos de mercado y archivo de mesas.
- `js/chart.js` — gráfico SVG, media móvil y tooltips.
- `js/app.js` — interfaz, eventos y panel de administrador.
- `js/tv.js` — render en vivo de la pantalla de TV.
