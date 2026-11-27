# La Esquina · APK de Android

Empaqueta la app web de `../la-esquina` como aplicación Android con [Capacitor](https://capacitorjs.com).
El APK listo está en `../la-esquina/descargas/LaEsquina.apk`.

## Instalar en el celular
1. Pasar `LaEsquina.apk` al teléfono (WhatsApp, Drive, cable…) y abrirlo.
2. Android pide permitir "instalar apps desconocidas" para esa app: aceptar.
3. La primera vez que se saca una foto, permitir el acceso a la cámara.

## Diferencias con la versión web
- Compartir PDF usa el menú nativo de Android (WhatsApp, Gmail, Drive…), con el PDF adjunto.
- Google Calendar, WhatsApp y Gmail se abren en sus apps.
- El modo "Google Calendar automático" (Client ID) no está disponible: Google no permite iniciar sesión dentro de apps así.

## Volver a compilar
Requisitos: Node 20+, JDK 21 y Android SDK 35 (`ANDROID_HOME`).

```bash
npm install
# keystore.properties y la-esquina.jks (la clave de firma) van en esta carpeta; NO se suben al repo
npm run apk
# → android/app/build/outputs/apk/release/app-release.apk
```

Para que el teléfono acepte una actualización sin desinstalar (y sin perder las planillas guardadas),
el APK nuevo tiene que estar firmado con **la misma clave** (`la-esquina.jks`) y con `versionCode` mayor
en `android/app/build.gradle`. Sin `keystore.properties` se firma con la clave de depuración.
