"use client";
import dynamic from "next/dynamic";
import type { Envio, EstadoEnvio } from "@/lib/types";

// Leaflet usa `window`: se carga solo en el cliente.
const Inner = dynamic(() => import("./LiveMapInner"), {
  ssr: false,
  loading: () => <div className="grid h-full w-full place-items-center bg-[#0b1016] text-sm text-mute">Cargando mapa…</div>,
});

export function LiveMap(props: { bar: { lat: number; lng: number; nombre: string }; envios: Envio[]; foco?: string | null; nombresCadete?: Record<string, string> }) {
  return <Inner {...props} />;
}

/** Distancia en km (haversine) y ETA a velocidad urbana. */
export function distanciaKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h)) * 1.3; // factor de calles
}
export function etaMin(e: Envio) {
  if (e.latitud_actual == null || e.longitud_actual == null) return null;
  const km = distanciaKm({ lat: e.latitud_actual, lng: e.longitud_actual }, { lat: e.lat_destino, lng: e.lng_destino });
  return Math.max(1, Math.round((km / Math.max(e.velocidad_kmh ?? 22, 12)) * 60));
}

export const ENVIO_ESTADO: Record<EstadoEnvio, { t: string; tono: "up" | "warn" | "info" | "mute" | "down" | "violet" }> = {
  pendiente: { t: "Pendiente", tono: "mute" }, preparando: { t: "Preparando", tono: "warn" }, listo: { t: "Listo", tono: "info" },
  en_camino: { t: "En camino", tono: "up" }, entregado: { t: "Entregado", tono: "mute" }, cancelado: { t: "Cancelado", tono: "down" },
};

