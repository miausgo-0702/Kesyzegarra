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
   [`web/config.js`](web/config.js) reemplazando `window.FIREBASE_CONFIG = null;` por
   `window.FIREBASE_CONFIG = { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." };`
4. Se vuelve a generar el APK y se publica la versión web.

## 5. Primer uso
1. Un administrador ingresa primero: la app sube sola las planillas iniciales.
2. Cada empleado toca **Registrarme**, pone su DNI, elige su nombre y crea su PIN de 4 números.

## Seguridad
- Las reglas permiten que cada empleado vea solo su propia cuenta. Los horarios, los cambios y
  los avisos los ven todos los empleados registrados.
- Solo los dos administradores pueden ver la lista de empleados, borrar cuentas, editar planillas,
  cargar cambios y publicar avisos.
- Una persona de la planilla puede tener una sola cuenta. Si alguien se registra con el nombre equivocado,
  un administrador la borra o la reasigna desde **Panel → Empleados**.
- Para cambiar la clave de un administrador: Authentication → Usuarios → ⋮ → Restablecer contraseña
  (o borrarlo y crearlo de nuevo con la clave nueva).
