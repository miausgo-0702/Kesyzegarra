"use client";
import "leaflet/dist/leaflet.css";
import { Fragment, useEffect } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { Envio } from "@/lib/types";

const pin = (color: string) => L.divIcon({
  className: "",
  html: `<svg width="28" height="38" viewBox="0 0 28 38"><path d="M14 0C6.3 0 0 6.2 0 13.9 0 24.3 14 38 14 38s14-13.7 14-24.1C28 6.2 21.7 0 14 0z" fill="${color}"/><circle cx="14" cy="14" r="5.5" fill="#05070a"/></svg>`,
  iconSize: [28, 38],
  iconAnchor: [14, 38],
});
const moto = L.divIcon({
  className: "",
  html: `<div style="width:34px;height:34px;border-radius:999px;background:#4c9dff;border:3px solid #05070a;box-shadow:0 0 0 6px rgba(76,157,255,.25),0 0 18px #4c9dff;display:grid;place-items:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg></div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function Encuadre({ puntos }: { puntos: [number, number][] }) {
  const map = useMap();
  const key = puntos.map((p) => p.join()).join("|");
  useEffect(() => {
    if (puntos.length > 1) map.fitBounds(L.latLngBounds(puntos), { padding: [48, 48], maxZoom: 16 });
    else if (puntos.length === 1) map.setView(puntos[0], 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key.length > 0 ? key.split("|").length : 0]);
  return null;
}

export default function LiveMapInner({ bar, envios, foco, nombresCadete = {} }: { bar: { lat: number; lng: number; nombre: string }; envios: Envio[]; foco?: string | null; nombresCadete?: Record<string, string> }) {
  const activos = envios.filter((e) => e.estado !== "entregado" && e.estado !== "cancelado");
  const visibles = foco ? activos.filter((e) => e.id === foco) : activos;
  const puntos: [number, number][] = [[bar.lat, bar.lng], ...visibles.map((e) => [e.lat_destino, e.lng_destino] as [number, number])];
  for (const e of visibles) if (e.latitud_actual != null && e.longitud_actual != null) puntos.push([e.latitud_actual, e.longitud_actual]);

  return (
    <MapContainer center={[bar.lat, bar.lng]} zoom={14} className="h-full w-full" zoomControl attributionControl scrollWheelZoom>
      {/* Tiles: OpenStreetMap con filtro oscuro (sin clave). Para otro proveedor (Mapbox, MapTiler) usar NEXT_PUBLIC_MAP_TILES. */}
      <TileLayer url={process.env.NEXT_PUBLIC_MAP_TILES || "https://tile.openstreetmap.org/{z}/{x}/{y}.png"} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' maxZoom={19}
        className={process.env.NEXT_PUBLIC_MAP_TILES ? "" : "nexo-tiles-oscuros"} />
      <Encuadre puntos={puntos} />
      <CircleMarker center={[bar.lat, bar.lng]} radius={10} pathOptions={{ color: "#05070a", weight: 3, fillColor: "#1ee08f", fillOpacity: 1 }}>
        <Tooltip permanent direction="right" offset={[10, 0]} className="!rounded-md !border-0 !bg-black/80 !px-2 !py-1 !text-xs !font-semibold !text-white">{bar.nombre}</Tooltip>
      </CircleMarker>
      {visibles.map((e) => {
        const tiene = e.latitud_actual != null && e.longitud_actual != null;
        return (
          <Fragment key={e.id}>
            <Marker position={[e.lat_destino, e.lng_destino]} icon={pin(e.estado === "en_camino" ? "#ff4d5e" : "#f5b83d")}>
              <Tooltip direction="top" offset={[0, -36]}>{e.direccion}</Tooltip>
            </Marker>
            {tiene && e.estado === "en_camino" && (
              <>
                <Polyline positions={[[bar.lat, bar.lng], [e.latitud_actual!, e.longitud_actual!]]} pathOptions={{ color: "#1ee08f", weight: 4, opacity: 0.85 }} />
                <Polyline positions={[[e.latitud_actual!, e.longitud_actual!], [e.lat_destino, e.lng_destino]]} pathOptions={{ color: "#1ee08f", weight: 3, opacity: 0.6, dashArray: "6 8" }} />
                <Marker position={[e.latitud_actual!, e.longitud_actual!]} icon={moto}>
                  <Tooltip permanent direction="right" offset={[18, 0]} className="!rounded-md !border-0 !bg-black/80 !px-2 !py-1 !text-xs !font-semibold !text-white">
                    {(e.cadete_id && nombresCadete[e.cadete_id]) || "Cadete"}{e.velocidad_kmh ? ` · ${Math.round(e.velocidad_kmh)} km/h` : ""}
                  </Tooltip>
                </Marker>
              </>
            )}
          </Fragment>
        );
      })}
    </MapContainer>
  );
}
