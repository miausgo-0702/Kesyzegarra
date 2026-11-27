/* Lector de códigos en segundo plano: recibe recortes del video (escala de grises)
 * y devuelve el código apenas lo encuentra, sin trabar la pantalla. */
self.importScripts('vendor/zxing.min.js');
const Z = self.ZXing;
const F = Z.BarcodeFormat;
const FORMATOS = [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.CODABAR, F.QR_CODE, F.DATA_MATRIX];

function lector(dificil) {
  const h = new Map();
  h.set(Z.DecodeHintType.POSSIBLE_FORMATS, FORMATOS);
  if (dificil) h.set(Z.DecodeHintType.TRY_HARDER, true);
  const r = new Z.MultiFormatReader();
  r.setHints(h);
  return r;
}
const rapido = lector(false), dificil = lector(true);

self.onmessage = e => {
  const { id, lum, w, h, hard } = e.data;
  let texto = null, formato = null;
  try {
    const src = new Z.RGBLuminanceSource(lum, w, h);
    const res = (hard ? dificil : rapido).decodeWithState(new Z.BinaryBitmap(new Z.HybridBinarizer(src)));
    texto = res.getText();
    formato = F[res.getBarcodeFormat()];
  } catch (_) { /* no había código en este cuadro */ }
  self.postMessage({ id, texto, formato });
};
self.postMessage({ listo: true });
