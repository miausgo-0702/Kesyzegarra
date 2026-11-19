"use client";
import { useState } from "react";
// Ilustraciones planas de productos (SVG propio, sin imágenes externas).
import type { ReactElement } from "react";

const glassStroke = "#cfe3f0";

function Highball({ liquid, garnish, ice = true, foam }: { liquid: string; garnish?: ReactElement; ice?: boolean; foam?: boolean }) {
  return (
    <>
      <path d="M20 14h24l-3 40a4 4 0 0 1-4 3.6H27a4 4 0 0 1-4-3.6z" fill={liquid} fillOpacity=".85" />
      {foam && <path d="M20 14h24l-.4 5H20.4z" fill="#f4efe6" />}
      {ice && (
        <g fill="#ffffff" fillOpacity=".55">
          <rect x="26" y="26" width="7" height="7" rx="1.5" />
          <rect x="33" y="34" width="7" height="7" rx="1.5" />
          <rect x="27" y="41" width="6" height="6" rx="1.5" />
        </g>
      )}
      <path d="M20 14h24l-3 40a4 4 0 0 1-4 3.6H27a4 4 0 0 1-4-3.6z" fill="none" stroke={glassStroke} strokeWidth="1.6" strokeOpacity=".7" />
      {garnish}
    </>
  );
}

const ICONS: Record<string, () => ReactElement> = {
  mojito: () => (
    <Highball
      liquid="#bfe8c8"
      garnish={<>
        <path d="M36 6l-4 30" stroke="#7fd1a8" strokeWidth="2" />
        <path d="M22 13c3-6 9-6 11-2-4 3-8 4-11 2z" fill="#2fbf71" />
        <circle cx="45" cy="13" r="5.5" fill="#c7e04a" stroke="#8fae22" strokeWidth="1.2" />
      </>}
    />
  ),
  gintonic: () => (
    <Highball liquid="#a9cfee" garnish={<><circle cx="32" cy="12" r="6" fill="none" stroke="#d6e86a" strokeWidth="1.6" /><path d="M26 12h12M32 6v12" stroke="#d6e86a" strokeWidth="1.2" /></>} />
  ),
  cuba: () => <Highball liquid="#5a2f1d" garnish={<circle cx="44" cy="14" r="5" fill="#9ed24a" />} />,
  fernet: () => <Highball liquid="#3a1d12" garnish={<path d="M20 15h24" stroke="#d9b48c" strokeWidth="2" strokeOpacity=".6" />} />,
  negroni: () => (
    <>
      <path d="M17 24h30l-2.5 26a5 5 0 0 1-5 4.5h-15a5 5 0 0 1-5-4.5z" fill="#b3263a" fillOpacity=".9" />
      <rect x="27" y="32" width="10" height="10" rx="2" fill="#fff" fillOpacity=".45" />
      <path d="M17 24h30l-2.5 26a5 5 0 0 1-5 4.5h-15a5 5 0 0 1-5-4.5z" fill="none" stroke={glassStroke} strokeWidth="1.6" strokeOpacity=".7" />
      <path d="M42 22c2-6 6-8 9-7-1 4-4 7-9 7z" fill="#f08c2a" />
    </>
  ),
  aperol: () => (
    <>
      <path d="M18 12h28c0 14-6 22-14 22S18 26 18 12z" fill="#f07a2a" fillOpacity=".9" />
      <path d="M18 12h28c0 14-6 22-14 22S18 26 18 12z" fill="none" stroke={glassStroke} strokeWidth="1.6" strokeOpacity=".7" />
      <path d="M32 34v18M23 54h18" stroke={glassStroke} strokeWidth="2" strokeOpacity=".8" strokeLinecap="round" />
      <circle cx="38" cy="16" r="6" fill="#ffb347" stroke="#e8892a" strokeWidth="1.2" />
      <circle cx="27" cy="20" r="2" fill="#3fbf6a" />
    </>
  ),
  beer: () => (
    <>
      <path d="M16 16h26v36a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4z" fill="#e8b23a" />
      <path d="M42 24h5a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5h-5" fill="none" stroke="#e8b23a" strokeWidth="3.2" />
      <path d="M14 18c0-5 4-8 8-7 2-4 9-4 11 0 4-2 10 0 10 7z" fill="#fbf4e2" />
      <path d="M22 26v24M29 26v24M36 26v24" stroke="#fff" strokeOpacity=".25" strokeWidth="1.5" />
    </>
  ),
  beerlight: () => (
    <>
      <path d="M20 12h24l-2.5 42a4 4 0 0 1-4 3.6H26.5a4 4 0 0 1-4-3.6z" fill="#f2cf5b" />
      <path d="M19 14c0-4 3-6 6-5 2-3 7-3 9 0 3-2 10 0 10 5z" fill="#fbf4e2" />
      <path d="M20 12h24l-2.5 42a4 4 0 0 1-4 3.6H26.5a4 4 0 0 1-4-3.6z" fill="none" stroke={glassStroke} strokeWidth="1.4" strokeOpacity=".6" />
    </>
  ),
  burger: () => (
    <>
      <path d="M12 30c0-11 9-17 20-17s20 6 20 17z" fill="#e9a33b" />
      <g fill="#fbe7b5"><circle cx="24" cy="21" r="1.2" /><circle cx="31" cy="18" r="1.2" /><circle cx="38" cy="21" r="1.2" /><circle cx="29" cy="25" r="1.2" /><circle cx="42" cy="26" r="1.2" /></g>
      <path d="M10 33c4-3 6 1 9-1s5 2 8 0 5 2 9 0 5 2 8 0 6 1 10 1v2H10z" fill="#43b04a" />
      <rect x="11" y="35" width="42" height="4" rx="2" fill="#f2c230" />
      <rect x="12" y="39" width="40" height="7" rx="3.5" fill="#6b3a22" />
      <path d="M12 48h40v2c0 4-3 6-7 6H19c-4 0-7-2-7-6z" fill="#e39a33" />
    </>
  ),
  pizza: () => (
    <>
      <circle cx="32" cy="34" r="22" fill="#e4a13d" />
      <circle cx="32" cy="34" r="18.5" fill="#f3c65a" />
      <g fill="#d2402f"><circle cx="25" cy="27" r="3.4" /><circle cx="39" cy="28" r="3.4" /><circle cx="31" cy="38" r="3.4" /><circle cx="41" cy="41" r="3" /><circle cx="23" cy="41" r="3" /></g>
      <g fill="#2fa84f"><path d="M32 22l2 4h-4z" /><path d="M35 34l2 4h-4z" /><path d="M27 33l2 4h-4z" /></g>
      <path d="M32 15.5v37M13.5 34h37" stroke="#c98a2c" strokeWidth=".8" strokeOpacity=".7" />
    </>
  ),
  fries: () => (
    <>
      <g fill="#f6cf45">{[18, 23, 28, 33, 38, 43].map((x, i) => <rect key={x} x={x} y={10 + (i % 3) * 3} width="4" height="26" rx="1" />)}</g>
      <path d="M14 28h36l-4 26a3 3 0 0 1-3 2.6H21a3 3 0 0 1-3-2.6z" fill="#d93a32" />
      <path d="M24 40c3 3 13 3 16 0" stroke="#fff" strokeWidth="2" fill="none" strokeOpacity=".6" />
    </>
  ),
  salad: () => (
    <>
      <circle cx="22" cy="28" r="7" fill="#4cbf55" /><circle cx="32" cy="24" r="8" fill="#3aa84a" /><circle cx="42" cy="28" r="7" fill="#5ccf62" />
      <circle cx="28" cy="27" r="3" fill="#e24a3b" /><circle cx="39" cy="25" r="3" fill="#f2c230" /><circle cx="34" cy="31" r="2.6" fill="#fff" />
      <path d="M10 32h44c0 13-10 22-22 22S10 45 10 32z" fill="#dfe6ea" />
      <path d="M10 32h44" stroke="#b7c3ca" strokeWidth="1.5" />
    </>
  ),
  milanesa: () => (
    <>
      <ellipse cx="32" cy="38" rx="24" ry="14" fill="#e5eaef" />
      <path d="M14 36c2-9 13-13 22-11s14 7 13 12-11 9-21 8-16-3-14-9z" fill="#c9862f" />
      <path d="M19 35c3-5 10-7 17-6s10 4 9 7-8 6-15 5-13-2-11-6z" fill="#f2c65a" />
      <circle cx="27" cy="34" r="2.5" fill="#d2402f" /><circle cx="36" cy="36" r="2.5" fill="#d2402f" />
    </>
  ),
  provoleta: () => (
    <>
      <ellipse cx="32" cy="40" rx="22" ry="12" fill="#4a4f57" />
      <ellipse cx="32" cy="37" rx="17" ry="10" fill="#f3c65a" />
      <path d="M18 36c5-4 23-4 28 0" stroke="#c98a2c" strokeWidth="1.6" fill="none" />
      <g fill="#2fa84f"><circle cx="27" cy="35" r="1.2" /><circle cx="35" cy="38" r="1.2" /><circle cx="31" cy="33" r="1.2" /></g>
    </>
  ),
  dessert: () => (
    <>
      <ellipse cx="32" cy="48" rx="22" ry="6" fill="#e5eaef" />
      <path d="M18 46c0-14 6-24 14-24s14 10 14 24z" fill="#5a2f1d" />
      <path d="M24 24c4-5 12-5 16 0-3 3-13 3-16 0z" fill="#7a4126" />
      <circle cx="44" cy="22" r="7" fill="#f8f1dc" />
    </>
  ),
  lemonade: () => <Highball liquid="#f4e58a" garnish={<><circle cx="44" cy="14" r="6" fill="#f2d33a" stroke="#c9a91e" strokeWidth="1.2" /><path d="M22 12c3-5 8-5 10-2-4 3-7 3-10 2z" fill="#2fbf71" /></>} />,
  water: () => (
    <>
      <rect x="24" y="16" width="16" height="40" rx="5" fill="#9fd3f0" fillOpacity=".6" stroke={glassStroke} strokeWidth="1.4" />
      <rect x="27" y="8" width="10" height="8" rx="2" fill="#4c9dff" />
      <rect x="24" y="28" width="16" height="10" fill="#4c9dff" fillOpacity=".7" />
    </>
  ),
};

export const ICONOS_DISPONIBLES = Object.keys(ICONS);

/** Ruta base de los assets públicos (en la demo estática del visor se usa "./"). */
export const ASSET_BASE = process.env.NEXT_PUBLIC_ASSET_BASE ?? "/";
const CON_FOTO = new Set(["mojito", "gintonic", "negroni", "aperol", "fernet", "cuba", "beer", "beerlight", "burger", "pizza", "milanesa", "fries", "salad", "provoleta", "dessert", "lemonade", "water"]);
export const fotoProducto = (icono: string) => (CON_FOTO.has(icono) ? `${ASSET_BASE}fotos/${icono}.jpg` : null);

/**
 * Imagen del producto: fotografía real (public/fotos, licencia Unsplash) recortada en cuadrado.
 * Si el producto no tiene foto o la imagen falla, usa la ilustración vectorial como respaldo.
 */
export function ProductIcon({ icono, size = 56, className, tile = true, alt = "" }: { icono: string; size?: number | "full"; className?: string; tile?: boolean; alt?: string }) {
  const [fallo, setFallo] = useState(false);
  const src = fotoProducto(icono);
  const dim = size === "full" ? undefined : { width: size, height: size };
  const radio = size !== "full" && size < 48 ? "rounded-lg" : "rounded-xl";
  if (src && !fallo) {
    return (
      <span className={`relative inline-block shrink-0 overflow-hidden ${radio} bg-raised ${size === "full" ? "aspect-square w-full" : ""} ${className ?? ""}`} style={dim} aria-hidden={!alt}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" decoding="async" draggable={false} onError={() => setFallo(true)}
          className="h-full w-full object-cover" />
        <span className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-white/10" />
      </span>
    );
  }
  const Svg = ICONS[icono] ?? ICONS.burger;
  const px = size === "full" ? 120 : size;
  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden ${radio} ${tile ? "bg-[radial-gradient(circle_at_50%_35%,#1d2833,#0b1016)]" : ""} ${size === "full" ? "aspect-square w-full" : ""} ${className ?? ""}`}
      style={dim}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" width={px * 0.82} height={px * 0.82}>
        <ellipse cx="32" cy="59" rx="16" ry="2.5" fill="#000" fillOpacity=".45" />
        <Svg />
      </svg>
    </span>
  );
}

/** Foto de cliente: data URL / URL real, o ilustración si es una foto de demo ("icon:burger"). */
export function FotoView({ url, className, size = 120 }: { url: string; className?: string; size?: number | "full" }) {
  if (url.startsWith("icon:")) return <ProductIcon icono={url.slice(5)} size={size} className={className} />;
  if (size === "full") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="Foto de cliente" className={`aspect-square w-full object-cover ${className ?? ""}`} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Foto de cliente" className={`object-cover ${className ?? ""}`} style={{ width: size, height: size }} />;
}
