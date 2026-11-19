"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { NexoState, Sesion } from "../types";
import type { Accion } from "./actions";
import { DemoBackend, nuevoId, supabaseConfigurado, type Backend } from "./backend";
import { SupabaseBackend } from "./supabaseBackend";
import { prodId, MESAS_RAW, mesaId } from "./catalogo";
import { generarRecomendaciones } from "../ai/learningEngine";
import { crashActivo } from "../exchangeEngine";
import { minutosDesde } from "./selectors";

const BackendCtx = createContext<Backend | null>(null);

// Ritmo acelerado del modo demo (en producción: ventana de 15 min vía pg_cron)
export const DEMO_TICK_MS = 30_000;
export const DEMO_VENTANA_MS = 60_000;

export function NexoProvider({ children }: { children: ReactNode }) {
  const [backend, setBackend] = useState<Backend | null>(null);
  useEffect(() => { setBackend(supabaseConfigurado() ? new SupabaseBackend() : new DemoBackend()); }, []);
  if (!backend) return <Cargando />;
  return (
    <BackendCtx.Provider value={backend}>
      {backend.modo === "demo" && <SimuladorDemo backend={backend} />}
      <Esperar backend={backend}>{children}</Esperar>
    </BackendCtx.Provider>
  );
}

function Esperar({ backend, children }: { backend: Backend; children: ReactNode }) {
  const s = useSyncExternalStore(backend.subscribe.bind(backend), () => backend.getState(), () => null);
  return s ? <>{children}</> : <Cargando />;
}

function Cargando() {
  // Esqueleto del layout en vez de un spinner: la pantalla ya "tiene forma" mientras conecta
  return (
    <div className="flex min-h-dvh bg-bg" aria-busy="true" aria-label="Cargando">
      <div className="hidden w-56 shrink-0 flex-col gap-3 border-r border-line p-4 lg:flex">
        <div className="skeleton h-6 w-32" />
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-9" />)}
      </div>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="skeleton h-8 w-64" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-24" />)}</div>
        <div className="skeleton h-64" />
      </div>
    </div>
  );
}

export function useBackend() {
  const b = useContext(BackendCtx);
  if (!b) throw new Error("NexoProvider ausente");
  return b;
}

/** Suscripción con selector. Reemplaza al useRealtime de Supabase en modo demo. */
export function useNexo(): NexoState;
export function useNexo<T>(sel: (s: NexoState) => T): T;
export function useNexo<T>(sel?: (s: NexoState) => T) {
  const b = useBackend();
  const s = useSyncExternalStore(b.subscribe.bind(b), () => b.getState()!, () => b.getState()!);
  return sel ? sel(s) : s;
}

/** Despachar con manejo de error amigable (devuelve el mensaje o null). */
export function useDispatch() {
  const b = useBackend();
  return useCallback(async (a: Accion): Promise<string | null> => {
    try { await b.dispatch(a); return null; } catch (e) { return e instanceof Error ? e.message : String(e); }
  }, [b]);
}

/** Estado de la conexión y acciones esperando en la cola offline. */
export function useConexion() {
  const b = useBackend();
  const [estado, setEstado] = useState({ online: true, pendientes: 0 });
  useEffect(() => {
    const leer = () => setEstado({ online: navigator.onLine, pendientes: "pendientes" in b ? (b as unknown as { pendientes(): number }).pendientes() : 0 });
    leer();
    window.addEventListener("online", leer); window.addEventListener("offline", leer); window.addEventListener("nexoresto:cola", leer);
    return () => { window.removeEventListener("online", leer); window.removeEventListener("offline", leer); window.removeEventListener("nexoresto:cola", leer); };
  }, [b]);
  return estado;
}

/** Reloj compartido (re-render cada `ms`). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

// ---------------------------------------------------------------------------
// Sesión (PIN). Se guarda POR PESTAÑA (sessionStorage): así en modo demo se puede
// tener abierta la caja, la cocina y el salón en el mismo navegador con distintos
// usuarios. En Supabase la sesión real la maneja Auth (cookies) y acá queda el perfil.
// ---------------------------------------------------------------------------
const SES_KEY = "nexoresto:sesion";
const sesListeners = new Set<() => void>();
let sesCache: { raw: string | null; val: Sesion | null } = { raw: null, val: null };
function leerSesion(): Sesion | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SES_KEY);
  if (raw !== sesCache.raw) {
    let val: Sesion | null = null;
    try { val = raw ? JSON.parse(raw) : null; } catch { val = null; }
    // sesiones cortas en dispositivos compartidos: 12 h
    if (val && Date.now() - val.desde > 12 * 3600_000) { sessionStorage.removeItem(SES_KEY); val = null; }
    sesCache = { raw, val };
  }
  return sesCache.val;
}
export function guardarSesion(s: Sesion | null) {
  if (s) sessionStorage.setItem(SES_KEY, JSON.stringify(s)); else sessionStorage.removeItem(SES_KEY);
  sesListeners.forEach((l) => l());
}
export function useSesion() {
  return useSyncExternalStore(
    (fn) => { sesListeners.add(fn); return () => { sesListeners.delete(fn); }; },
    leerSesion,
    () => null,
  );
}

/** Identificador anónimo del cliente en la mesa (votos, fotos). */
export function useSesionCliente() {
  const [id, setId] = useState<string>("");
  useEffect(() => {
    let v = localStorage.getItem("nexoresto:cliente");
    if (!v) { v = nuevoId(); localStorage.setItem("nexoresto:cliente", v); }
    setId(v);
  }, []);
  return id;
}

// ---------------------------------------------------------------------------
// Simulador del modo demo: una sola pestaña "líder" (Web Locks) corre el motor
// Exchange, genera pedidos de clientes, mueve al cadete y refresca la IA.
// ---------------------------------------------------------------------------
function SimuladorDemo({ backend }: { backend: Backend }) {
  const lider = useRef(false);
  useEffect(() => {
    let liberar: (() => void) | undefined;
    const tomar = () => { lider.current = true; };
    if (navigator.locks?.request) {
      navigator.locks.request("nexoresto-lider", () => new Promise<void>((res) => { tomar(); liberar = res; }));
    } else tomar();
    return () => { liberar?.(); lider.current = false; };
  }, []);

  useEffect(() => {
    const d = (a: Accion) => backend.dispatch(a).catch(() => undefined);
    const st = () => backend.getState()!;
    let ultimoPedido = 0;

    const tickExchange = setInterval(() => {
      if (!lider.current) return;
      d({ type: "exchangeTick", ventanaMs: DEMO_VENTANA_MS });
    }, DEMO_TICK_MS);

    const tickSim = setInterval(() => {
      if (!lider.current) return;
      const s = st();
      const now = Date.now();
      // Fin automático del crash
      if (s.crash && !crashActivo(s.crash, now)) d({ type: "finalizarCrash" });

      // Cadete simulado: avanza hacia el destino si no hay GPS real reciente
      for (const e of s.envios) {
        if (e.estado !== "en_camino" || e.latitud_actual == null || e.longitud_actual == null) continue;
        if (e.ultima_actualizacion && now - new Date(e.ultima_actualizacion).getTime() < 2500) continue;
        const dLat = e.lat_destino - e.latitud_actual, dLng = e.lng_destino - e.longitud_actual;
        const dist = Math.hypot(dLat, dLng);
        if (dist < 0.0004) { d({ type: "entregarEnvio", envio_id: e.id }); continue; }
        const paso = Math.min(0.00045, dist);
        // movimiento "en grilla" (como por calles)
        const porLat = Math.abs(dLat) > Math.abs(dLng);
        d({ type: "gps", envio_id: e.id, lat: e.latitud_actual + (porLat ? Math.sign(dLat) * Math.min(paso, Math.abs(dLat)) : 0), lng: e.longitud_actual + (!porLat ? Math.sign(dLng) * Math.min(paso, Math.abs(dLng)) : 0), velocidad_kmh: 18 + Math.round(Math.random() * 14) });
      }
      if (!s.simulacion) return;

      // Clientes: un pedido nuevo cada ~9 s si la cocina no está desbordada
      const pendientes = s.items.filter((i) => i.estado_cocina === "pendiente" || i.estado_cocina === "marchando").length;
      if (now - ultimoPedido > 9000 && pendientes < 26 && Math.random() < 0.7) {
        ultimoPedido = now;
        const enCrash = s.crash?.productos ?? [];
        const n = 1 + Math.floor(Math.random() * 3);
        const items = Array.from({ length: n }, () => {
          // más demanda en tragos en crash y en destacados
          const pool = Math.random() < 0.35 && enCrash.length ? enCrash : s.productos.filter((p) => p.activo).map((p) => p.id);
          const pesos = pool.map((id) => { const p = s.productos.find((x) => x.id === id)!; return (p.destacado ? 2 : 1) * (p.precio_actual < p.precio_base ? 1.5 : 1); });
          let r = Math.random() * pesos.reduce((a, b) => a + b, 0), idx = 0;
          while (r > pesos[idx] && idx < pool.length - 1) { r -= pesos[idx]; idx++; }
          return { producto_id: pool[idx], cantidad: 1 + (Math.random() < 0.25 ? 1 : 0) };
        });
        const mesasLibres = s.mesas.filter((m) => m.estado !== "reservada");
        const mesa = mesasLibres[Math.floor(Math.random() * mesasLibres.length)] ?? s.mesas[0];
        d({ type: "crearPedido", tipo: Math.random() < 0.4 ? "webapp_qr" : "salon", mesa_id: mesa.id, items, idempotency_key: nuevoId(), mozo_id: s.usuarios.find((u) => u.rol === "mozo")?.id ?? null, sesion_cliente: `sim-${Math.floor(Math.random() * 40)}` });
      }
      // Ítems olvidados > 30 min: la cocina "virtual" los despacha para que la demo no se trabe
      const viejo = s.items.find((i) => (i.estado_cocina === "pendiente" || i.estado_cocina === "marchando") && minutosDesde(i.creado_at, now) > 30);
      if (viejo) d({ type: "despacharComanda", pedido_id: viejo.pedido_id, estacion: viejo.estacion });
      // Mesas que pidieron cuenta hace mucho se liberan (pago simulado fuera de caja)
      // Votos espontáneos del público
      const aprobadas = s.fotos.filter((f) => f.estado === "aprobada" && !f.es_ganadora);
      if (aprobadas.length && Math.random() < 0.25) {
        const f = aprobadas[Math.floor(Math.random() * aprobadas.length)];
        d({ type: "votar", foto_id: f.id, sesion_cliente: `sim-voto-${nuevoId()}` });
      }
    }, 3000);

    const tickIa = setInterval(() => {
      if (!lider.current) return;
      d({ type: "nuevasRecomendaciones", items: generarRecomendaciones(st()) });
    }, 45_000);
    // primera tanda
    setTimeout(() => { if (lider.current && !st().recomendaciones.some((r) => r.estado === "pendiente")) d({ type: "nuevasRecomendaciones", items: generarRecomendaciones(st()) }); }, 1500);

    return () => { clearInterval(tickExchange); clearInterval(tickSim); clearInterval(tickIa); };
  }, [backend]);
  return null;
}

export const DEMO = { prodId, mesaId, MESAS_RAW };
