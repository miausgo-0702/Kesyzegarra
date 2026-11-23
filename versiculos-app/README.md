# Versículo Diario (Android)

App para Android que muestra un versículo de la Biblia (Reina-Valera 1960) en la pantalla de bloqueo.

**Descargar:** [`VersiculoDiario.apk`](VersiculoDiario.apk) (Android 8.0 o superior).

## Cómo se ve en la pantalla de bloqueo

Android quitó los widgets de la pantalla de bloqueo en la versión 5 y solo algunos modelos con Android 15/16 los han vuelto a permitir. Por eso la app tiene tres formas de mostrarlo:

1. **Fondo de bloqueo con el versículo** (funciona en todos los teléfonos): la app dibuja el versículo sobre un degradado y lo pone como fondo de la pantalla de bloqueo. Cambia solo cada día. Al desactivarlo, el bloqueo vuelve a usar el fondo de inicio.
2. **Notificación fija**: aparece en la pantalla de bloqueo, con un botón "Otro versículo".
3. **Widget**: para la pantalla de inicio, y también para la de bloqueo en los dispositivos que lo admiten. Tócalo para ver otro versículo.

## Instalar

1. Descarga `VersiculoDiario.apk` en el teléfono.
2. Ábrelo y, si lo pide, permite "Instalar apps de origen desconocido".
3. Abre **Versículo Diario** y activa "Poner el versículo como fondo de bloqueo".

## Añadir o cambiar versículos

Edita `app/src/main/assets/versiculos.txt` (una línea por versículo: `Referencia|Texto`) y vuelve a compilar:

```
./gradlew assembleDebug
```
