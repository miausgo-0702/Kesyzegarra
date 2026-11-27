# Activar el modo online (datos compartidos)

Sin este paso la app funciona en **modo local**: cada celular guarda sus propios datos y los
administradores no ven los registros de los empleados. Con Firebase (gratis) todos comparten
la misma información en tiempo real. Lleva unos 10 minutos y una cuenta de Google.

## 1. Crear el proyecto
1. Entrá a https://console.firebase.google.com y tocá **Crear un proyecto**.
2. Nombre: `mis-horarios`. Podés desactivar Google Analytics. Tocá **Crear proyecto**.

## 2. Activar el ingreso con usuario y clave
1. Menú izquierdo: **Compilación → Authentication → Comenzar**.
2. En **Método de acceso** elegí **Correo electrónico/contraseña**, activá el primer interruptor y **Guardar**.
3. Pestaña **Usuarios → Agregar usuario**, y creá los dos administradores:

   | Correo | Contraseña |
   |---|---|
   | `lezana@admin.mishorarios.app` | la clave de Lezana |
   | `julianpz@admin.mishorarios.app` | la clave de julianpz |

   En la app ingresan como **Lezana** y **julianpz**. Estos correos no son reales ni reciben mails;
   solo identifican a los administradores. Los administradores no aparecen en ninguna lista de empleados.

## 3. Crear la base de datos
1. Menú izquierdo: **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación: `southamerica-east1 (São Paulo)`. Modo: **producción**. **Crear**.
3. Pestaña **Reglas**: borrá lo que haya, pegá todo el contenido de
   [`firebase/firestore.rules`](firebase/firestore.rules) y tocá **Publicar**.

## 4. Conectar la app
1. Tocá el engranaje ⚙ → **Configuración del proyecto**.
2. Abajo, en **Tus apps**, tocá el ícono **`</>`** (Web). Apodo: `Mis Horarios`. **Registrar app**.
3. Va a aparecer un bloque `const firebaseConfig = { apiKey: "...", ... }`.
   Mandáselo a Claude (no es secreto: es la dirección pública del proyecto) o pegalo vos en
   [`web/config.js`](web/config.js) reemplazando `self.FIREBASE_CONFIG = null;` por
   `self.FIREBASE_CONFIG = { apiKey: "...", authDomain: "...", projectId: "...", messagingSenderId: "...", appId: "..." };`
4. Se vuelve a generar el APK y se publica la versión web.

## 5. Primer uso
1. Un administrador ingresa primero: la app sube sola las planillas iniciales.
2. Cada empleado toca **Registrarme**, pone su DNI, elige su nombre y crea su PIN de 4 números.

## 6. Notificaciones con la app cerrada (push)
Con esto llegan al instante, aunque la app esté cerrada:
**cambio de horario** (al empleado), **respuesta** (a los administradores),
**planilla nueva** (a cada empleado con su horario) y **"Tu semana"** (domingos 20 hs).

Las funciones del servidor necesitan el **plan Blaze** de Firebase (pago por uso). Para una farmacia el
uso queda dentro de la cuota gratuita, así que en la práctica cuesta $0, pero Google pide cargar una tarjeta.

1. **Plan Blaze:** abajo a la izquierda, **Spark → Actualizar → Blaze**. Recomendado: en
   *Presupuesto* poné una alerta de, por ejemplo, US$ 1 para enterarte si algo cambia.
2. **App de Android:** ⚙ Configuración del proyecto → **Tus apps → Agregar app → Android**.
   Nombre del paquete: `com.kesyzegarra.horarios`. **Registrar app** y **descargá `google-services.json`**.
   Mandáselo a Claude (o copialo en `app/google-services.json`).
3. **Notificaciones en PC / iPhone:** ⚙ Configuración del proyecto → pestaña **Cloud Messaging** →
   *Certificados web push* → **Generar par de claves**. Copiá la clave (empieza con `B...`) y mandásela a
   Claude (o pegala en `web/config.js` en `self.VAPID_KEY`). Es una clave pública, no es secreta.
4. **Subir las funciones** (una sola vez, y cada vez que cambien):
   1. Entrá a https://console.cloud.google.com, elegí tu proyecto arriba y tocá el ícono
      **Activar Cloud Shell** (`>_`, arriba a la derecha). Se abre una terminal en el navegador.
   2. Pegá estos comandos (cambiá `ID-DEL-PROYECTO` por el ID de tu proyecto, por ejemplo `mis-horarios-1a2b3`):
      ```bash
      git clone https://github.com/miausgo-0702/Kesyzegarra.git
      cd Kesyzegarra/horarios-app/firebase
      npx -y firebase-tools@13.29.1 login --no-localhost
      ./desplegar.sh ID-DEL-PROYECTO
      ```
      El `login` te da un enlace: abrilo, aceptá con tu cuenta de Google y pegá el código que te muestra.
   3. Tarda unos minutos. Al final dice **"Listo: notificaciones activadas"**.
5. **En cada teléfono:** al ingresar, la app pide permiso para mostrar notificaciones: hay que aceptar.
   - **Android:** listo. Si es Xiaomi / Huawei / Samsung con ahorro de batería fuerte, conviene sacar
     "Mis Horarios" de la optimización de batería.
   - **iPhone:** abrir la versión web en Safari → Compartir → **Agregar a inicio**, abrirla desde ese
     ícono e ingresar (requiere iOS 16.4 o más nuevo). Desde Safari "suelto" Apple no permite notificaciones.
   - **PC:** abrir la versión web en Chrome o Edge y aceptar las notificaciones.

## 7. Asistente de IA para administradores
Lezana y julianpz tienen una pestaña **IA** (✨) para consultar y modificar horarios escribiendo,
hablando, mandando una foto de una planilla o en **conversación en vivo**. La IA **prepara** los cambios
y el administrador los confirma (botón *Aplicar* o diciendo "sí"); nada se aplica solo.

Usa Claude (modelo Claude Opus 5.5) a través de **Claude Managed Agents** de Anthropic: Anthropic aloja el
agente y guarda el historial de cada conversación. Requiere los pasos 1 a 6 (Firebase con plan Blaze) y:

1. **Cuenta y clave de Anthropic:** entrá a https://console.anthropic.com, creá una cuenta, cargá crédito
   (*Billing*, por ejemplo US$ 10) y en **API Keys → Create Key** creá una clave (empieza con `sk-ant-`).
   **No la mandes por chat ni la pegues en el código**: se guarda como secreto en el paso siguiente.
2. **Guardarla como secreto** en Cloud Shell (dentro de `Kesyzegarra/horarios-app/firebase`):
   ```bash
   npx -y firebase-tools@13.29.1 functions:secrets:set ANTHROPIC_API_KEY --project ID-DEL-PROYECTO
   ./desplegar.sh ID-DEL-PROYECTO
   ```
   El primer comando pide la clave (pegala y Enter; no se muestra). El segundo vuelve a subir las funciones.
3. Listo: en la app, pestaña **IA**. La primera pregunta tarda un poco más porque se crea el agente.

**Costos aproximados (se pagan a Anthropic):** una consulta o un cambio típico cuesta entre US$ 0,01 y 0,10;
cargar una planilla completa desde una foto, algo más. Cada conversación tiene un tope de **US$ 5**: al
llegar, la siguiente pregunta empieza una conversación nueva. Se puede poner un límite mensual en
console.anthropic.com → *Limits*.

**Voz:** en Android usa el dictado y la voz del teléfono (pide permiso de micrófono la primera vez);
en PC funciona con Chrome o Edge; en iPhone, con Safari.

## 8. Ofertas y descuentos (feed con flyers)
Todos ven la pestaña **Ofertas** (🏷️): un feed de mini flyers con foto, descuento, precio de antes y de ahora,
condiciones y vigencia, que se pueden compartir como imagen (WhatsApp, Instagram, etc.).

Los administradores tocan **✨ Cargar ofertas con IA** y suben **fotos**, un **Excel** (.xlsx, .xls, .csv), un **PDF**
o un **Word** (.docx). La IA (Claude, con la misma clave de la sección 7) arma una oferta por producto, se busca la
foto de cada uno en **Google Imágenes**, y el administrador revisa, corrige y publica.

**Buscador de imágenes de Google** (opcional, para que las fotos se busquen solas):
1. Creá una cuenta en https://serper.dev (2.500 búsquedas gratis; cada producto usa 1) y copiá tu **API key**.
   Alternativa: la búsqueda programable de Google (clave de API + ID del buscador "cx" con búsqueda de imágenes activada).
2. En la app: **Ofertas → ✨ Cargar ofertas con IA → Buscador de imágenes de Google**, pegá la clave y **Guardar clave**.
   Queda guardada en el servidor y ningún teléfono la puede leer.
Sin buscador configurado, cada oferta se puede publicar subiendo la foto a mano (o sin foto).

Las fotos de productos que trae el buscador pertenecen a sus dueños (fabricantes o comercios). Para uso interno y de
promoción de la farmacia suele no haber problema, pero si alguna marca lo pide, reemplazá la foto por una propia.

## Seguridad
- Las reglas permiten que cada empleado vea solo su propia cuenta. Los horarios, los cambios y
  los avisos los ven todos los empleados registrados.
- Solo los dos administradores pueden ver la lista de empleados, borrar cuentas, editar planillas,
  cargar cambios y publicar avisos.
- Una persona de la planilla puede tener una sola cuenta. Si alguien se registra con el nombre equivocado,
  un administrador la borra o la reasigna desde **Panel → Empleados**.
- Los dispositivos registrados para notificaciones solo los lee el servidor; cada usuario solo puede
  registrar o borrar los suyos. Al cerrar sesión, ese dispositivo deja de recibir notificaciones.
- El asistente de IA solo responde a las cuentas de Lezana y julianpz (lo verifica el servidor). La clave de
  Anthropic queda como secreto en Google Cloud y nunca llega a los teléfonos. Las preguntas, las fotos y los
  datos de horarios que la IA consulta se envían a Anthropic para responder; el historial de cada
  conversación queda guardado en Anthropic (Managed Agents).
- Para cambiar la clave de un administrador: Authentication → Usuarios → ⋮ → Restablecer contraseña
  (o borrarlo y crearlo de nuevo con la clave nueva).
