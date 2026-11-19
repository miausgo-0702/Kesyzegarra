// Backend intercambiable: LOCAL (navegador, sincronizado entre pestañas) o
// SUPABASE (producción). Ambos exponen la misma interfaz.
// El backend local es multi-bar: cada bar guarda su propio estado (carta, mesas,
// equipo, ventas) y la lista de bares es compartida.
import type { Bar, NexoState } from "../types";
import { reducir, type Accion } from "./actions";
import { crearEstadoBar, crearEstadoInicial, STATE_VERSION } from "./seed";
import { BAR_ID } from "./catalogo";

export interface Backend {
  modo: "demo" | "supabase";
  getState(): NexoState | null;
  subscribe(fn: () => void): () => void;
  dispatch(a: Accion): Promise<void>;
  reset?(): void;
  /** Cambia el bar activo del dispositivo (solo backend local). */
  cambiarBar?(barId: string): void;
}

const K_BARES = "nexoresto:bares";
const K_ACTIVO = "nexoresto:bar-activo";
const kEstado = (id: string) => `nexoresto:estado:${id}`;

export const nuevoId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function leer<T>(k: string): T | null {
  try { const raw = localStorage.getItem(k); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
}

export class DemoBackend implements Backend {
  modo = "demo" as const;
  private state!: NexoState;
  private barId!: string;
  private listeners = new Set<() => void>();
  private canal: BroadcastChannel | null = null;

  constructor() {
    let bares = leer<Bar[]>(K_BARES);
    if (!bares?.length) {
      const inicial = crearEstadoInicial();
      bares = inicial.bares;
      this.escribir(K_BARES, bares);
      this.escribir(kEstado(inicial.bar.id), inicial);
    }
    // La TV y la carta QR eligen el bar por la URL (/tv/<slug>, /menu/<slug>/...)
    const slug = window.location.pathname.match(/^\/(?:tv|menu)\/([a-z0-9-]+)/)?.[1];
    const porSlug = slug ? bares.find((b) => b.slug === slug)?.id : undefined;
    const guardado = localStorage.getItem(K_ACTIVO);
    this.abrir(porSlug ?? (bares.some((b) => b.id === guardado) ? guardado! : bares[0].id));

    window.addEventListener("storage", (e) => {
      if (e.key === kEstado(this.barId) || e.key === K_BARES) this.recargar();
    });
    if ("BroadcastChannel" in window) {
      this.canal = new BroadcastChannel("nexoresto");
      this.canal.onmessage = () => this.recargar();
    }
  }

  private bares(): Bar[] { return leer<Bar[]>(K_BARES) ?? []; }

  private escribir(k: string, v: unknown) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
  }

  /** Abre el estado de un bar (lo crea vacío la primera vez). */
  private abrir(id: string) {
    const bares = this.bares();
    const bar = bares.find((b) => b.id === id) ?? bares[0];
    let s = leer<NexoState>(kEstado(bar.id));
    if (!s || s.version !== STATE_VERSION) {
      // El bar de ejemplo arranca con una noche de servicio; uno nuevo, con la carta vacía
      s = bar.id === BAR_ID ? crearEstadoInicial() : crearEstadoBar(bar);
      this.escribir(kEstado(bar.id), s);
    }
    this.barId = bar.id;
    this.state = { ...s, bares, bar: { ...s.bar, ...bar } };
  }

  private recargar() {
    const s = leer<NexoState>(kEstado(this.barId));
    if (!s) return;
    const bares = this.bares();
    this.state = { ...s, bares, bar: { ...s.bar, ...(bares.find((b) => b.id === this.barId) ?? {}) } };
    this.emit();
  }

  private guardar() {
    if (!this.escribir(kEstado(this.barId), this.state)) {
      // Cuota llena (muchas fotos): recortamos historial y reintentamos
      this.state = { ...this.state, pedidos: this.state.pedidos.slice(0, 250), fotos: this.state.fotos.slice(0, 20) };
      this.escribir(kEstado(this.barId), this.state);
    }
    this.escribir(K_BARES, this.state.bares.map((b) => (b.id === this.barId ? { ...b, ...this.state.bar } : b)));
    this.canal?.postMessage("sync");
  }

  private emit() { this.listeners.forEach((l) => l()); }

  getState() { return this.state; }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  async dispatch(a: Accion) {
    const fresco = leer<NexoState>(kEstado(this.barId));
    if (fresco) this.state = { ...fresco, bares: this.bares(), bar: this.state.bar }; // evitar pisar cambios de otra pestaña
    const next = reducir(this.state, a, { now: Date.now(), uid: nuevoId });
    if (next === this.state) return;
    this.state = next;
    this.guardar();
    this.emit();
  }

  cambiarBar(barId: string) {
    if (barId === this.barId) return;
    localStorage.setItem(K_ACTIVO, barId);
    this.abrir(barId);
    this.emit();
  }

  reset() {
    Object.keys(localStorage).filter((k) => k.startsWith("nexoresto:") && k !== "nexoresto:cliente").forEach((k) => localStorage.removeItem(k));
    const inicial = crearEstadoInicial();
    this.escribir(K_BARES, inicial.bares);
    this.barId = inicial.bar.id;
    this.state = inicial;
    this.guardar();
    this.emit();
  }
}

export const supabaseConfigurado = () => !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
