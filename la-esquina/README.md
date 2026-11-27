# La Esquina · Planillas

App para el celular (se instala como aplicación, funciona sin internet) que:

1. **Saca una foto** del producto (o usa la cámara en vivo / una foto de la galería).
2. **Lee el código de barras** de la foto (EAN-13, EAN-8, UPC, Code128, Code39, ITF, QR…).
3. Lo pasa a una de **2 planillas**:
   - **Pedidos**: código de barras + nombre del producto (cantidad opcional).
   - **Vencidos**: código de barras + nombre + cantidad + vencimiento.
4. Por cada vencido crea un **recordatorio en Google Calendar** (N días antes, configurable en Ajustes).
5. Arma los **PDF** con el logo y los códigos de barra dibujados, listos para **WhatsApp o Gmail**.

El nombre del producto se completa solo si ya se cargó antes o si figura en Open Food Facts; si no, se escribe una vez y la app lo recuerda.

## Cómo usarla

Tiene que abrirse desde una dirección **https** (para usar la cámara e instalarla):

- **Render**: ya está en `render.yaml` como sitio estático `la-esquina` (New → Blueprint → este repo).
- **GitHub Pages** u otro hosting estático: subir la carpeta `la-esquina/` tal cual.
- En la PC, para probar: `cd la-esquina && python3 -m http.server 8080` y abrir http://localhost:8080

En el celular: abrir la dirección en Chrome → menú ⋮ → **Agregar a la pantalla principal**.

## Recordatorios de Google Calendar

- **Sin configurar nada**: al guardar un vencido se abre Google Calendar con el evento armado; se toca *Guardar*.
- **Automático (opcional)**: en Ajustes → *Google Calendar automático*, pegar un **Client ID OAuth** de Google Cloud
  (habilitar *Google Calendar API*, crear credencial *Aplicación web* y agregar la dirección de la app en
  *Orígenes autorizados de JavaScript*). Los eventos se crean solos, en la fecha de vencimiento, con aviso N días antes.
- Botón **Calendario** en Vencidos: exporta todos los vencimientos en un `.ics` para importar de una vez.

## Compartir

“Compartir PDF” abre el menú del teléfono (WhatsApp, Gmail, etc.) con el PDF adjunto. Si el navegador no lo permite
(por ejemplo en PC), el PDF se descarga y se abre WhatsApp Web o Gmail para adjuntarlo.

Los datos quedan guardados en el teléfono. Después de enviar, se pueden vaciar las planillas desde *Compartir*.
