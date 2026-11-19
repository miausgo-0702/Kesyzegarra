"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Código QR en SVG (cupones, mesas, seguimiento de delivery). */
export function QR({ value, size = 160, className, light = "#ffffff", dark = "#05070a" }: { value: string; size?: number; className?: string; light?: string; dark?: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    QRCode.toString(value, { type: "svg", margin: 1, color: { dark, light }, errorCorrectionLevel: "M" }).then(setSvg).catch(() => setSvg(""));
  }, [value, light, dark]);
  return <div className={className} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} aria-label={`Código QR: ${value}`} role="img" />;
}
