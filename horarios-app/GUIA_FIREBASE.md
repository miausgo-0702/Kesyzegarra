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

## Seguridad
- Las reglas permiten que cada empleado vea solo su propia cuenta. Los horarios, los cambios y
  los avisos los ven todos los empleados registrados.
- Solo los dos administradores pueden ver la lista de empleados, borrar cuentas, editar planillas,
  cargar cambios y publicar avisos.
- Una persona de la planilla puede tener una sola cuenta. Si alguien se registra con el nombre equivocado,
  un administrador la borra o la reasigna desde **Panel → Empleados**.
- Los dispositivos registrados para notificaciones solo los lee el servidor; cada usuario solo puede
  registrar o borrar los suyos. Al cerrar sesión, ese dispositivo deja de recibir notificaciones.
- Para cambiar la clave de un administrador: Authentication → Usuarios → ⋮ → Restablecer contraseña
  (o borrarlo y crearlo de nuevo con la clave nueva).
