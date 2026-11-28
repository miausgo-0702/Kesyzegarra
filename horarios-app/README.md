# Mis Horarios

App de horarios rotativos de la farmacia. Una sola base de código (`web/`) para:

| Plataforma | Cómo se usa |
|---|---|
| **Android** | Instalar el APK (se genera con `./gradlew assembleRelease`; no se sube al repositorio). |
| **iPhone / iPad** | Abrir la dirección web en **Safari** → Compartir → **Agregar a inicio**. |
| **PC (Windows / Mac / Linux)** | Abrir la dirección web en **Chrome o Edge** → ícono de instalar en la barra de direcciones. |

Dirección web (GitHub Pages, una vez que esta rama esté en `main`):
`https://miausgo-0702.github.io/Kesyzegarra/horarios/`

## Qué calcula
- **Semana (lunes a viernes):** cada semana todos bajan un puesto dentro de su sector; el último pasa al primero.
  Los que están en negrita en la planilla quedan fijos.
- **Fines de semana:** los grupos A y B se alternan. Cada vez que trabaja un grupo, dentro de cada sector
  todos bajan un puesto (negrita fija).
- **Feriados:** se calculan solos para cualquier año (Ley 27.399). Los de lunes a viernes van "uno sí, uno no"
  para cada persona. Los puentes turísticos se trabajan normal y se cargan cada año desde el Panel.
- **Cambios y francos** cargados por un administrador tienen prioridad sobre la planilla.

## Usuarios
- **Empleados:** se registran con DNI + PIN de 4 números y eligen su nombre de la planilla.
- **Administradores:** `Lezana` y `julianpz`. Ven y borran empleados, editan planillas, cargan cambios
  y francos, y publican avisos. No aparecen en ninguna lista.

## Modo local y modo online
Sin configurar, la app guarda todo en el dispositivo (modo local). Para compartir datos entre todos,
seguí [GUIA_FIREBASE.md](GUIA_FIREBASE.md).

En modo local el asistente de IA y la carga de ofertas funcionan igual: el administrador pega su clave de
Gemini una vez (en la pestaña IA o en Panel → Inteligencia artificial), queda guardada solo en ese teléfono
y la app habla directo con Gemini (`web/ia-local.js`). En modo local las fotos de productos se suben a mano.

## Desarrollo
- `web/` — la app (HTML/CSS/JS, sin compilación). `data.js` = planillas iniciales, `logic.js` = cálculos,
  `backend.js` = datos (local / Firebase), `app.js` = pantallas.
- `node test/logic.test.js` — pruebas de los cálculos.
- `./gradlew assembleRelease` — genera el APK (necesita el SDK de Android en `local.properties`).
- `firebase/` — reglas de seguridad de Firestore, configuración del emulador y `desplegar.sh`.
- `firebase/functions/gemini.js` y `asistente-gemini.js` — la IA con Gemini (Google): cambio automático de modelo,
  ciclo de herramientas propio e historial en Firestore. Prueba: `node functions/test/gemini.test.js`.
- `web/ia-herramientas.js` — instrucciones y herramientas del asistente (incluye `proponer_oferta`), compartidas
  por la app (modo local) y el servidor (`compartido/` se arma con `node functions/copiar-logica.js`).
- `firebase/functions/asistente.js` — asistente de IA de los administradores con Claude (Managed Agents):
  herramientas de consulta y de propuestas; `web/acciones.js` valida y aplica las propuestas (servidor y app).
  `web/voz.js` = dictado y lectura en voz alta. Prueba sin gastar: `node functions/test/asistente.test.js`
  (con el emulador de Firestore; usa un Claude simulado).
- `web/ofertas.js` — pestaña Ofertas (feed de flyers, carga con IA, compartir como imagen);
  `firebase/functions/ofertas.js` — lectura de fotos/Excel/PDF/Word con Claude (formato fijo) y Google Imágenes.
  Excel y Word se convierten a texto en la app con SheetJS 0.20.3 y mammoth (`web/vendor/`, se cargan solo al usarlos).
- `web/components/ui/` — componentes visuales: `live-orb.js` (la cara del asistente) y
  `sun-moon-theme-toggle.js` (botón de tema), adaptados a JavaScript de componentes shadcn/React.
- `firebase/functions/` — funciones del servidor que envían las notificaciones push (cambios, respuestas,
  planilla nueva y resumen semanal de los domingos 20 hs). Usan el mismo `logic.js` de la app.
  Prueba: `firebase emulators:exec --only auth,firestore,functions --project demo-mishorarios "npm --prefix functions test"`.
