// Backend intercambiable: MODO DEMO (navegador, sincronizado entre pestañas)
// o SUPABASE (producción). Ambos exponen la misma interfaz.
import type { NexoState } from "../types";
import { reducir, type Accion } from "./actions";
import { crearEstadoInicial, STATE_VERSION } from "./seed";

export interface Backend {
  modo: "demo" | "supabase";
  getState(): NexoState | null;
  subscribe(fn: () => void): () => void;
  dispatch(a: Accion): Promise<void>;
  reset?(): void;
}

const KEY = "nexoresto:estado";

export const nuevoId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export class DemoBackend implements Backend {
  modo = "demo" as const;
  private state: NexoState;
  private listeners = new Set<() => void>();
  private canal: BroadcastChannel | null = null;

  constructor() {
    this.state = this.cargar() ?? crearEstadoInicial();
    this.guardar();
    // Sincronización entre pestañas / pantallas del mismo navegador (TV, KDS, POS…)
    window.addEventListener("storage", (e) => {
      if (e.key === KEY && e.newValue) {
        try { this.state = JSON.parse(e.newValue); this.emit(); } catch { /* ignorar */ }
      }
    });
    if ("BroadcastChannel" in window) {
      this.canal = new BroadcastChannel("nexoresto");
      this.canal.onmessage = () => { const s = this.cargar(); if (s) { this.state = s; this.emit(); } };
    }
  }

  private cargar(): NexoState | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as NexoState;
      return s.version === STATE_VERSION ? s : null;
    } catch { return null; }
  }

  private guardar() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      // Cuota llena (fotos grandes): recortamos historial y reintentamos
      this.state = { ...this.state, pedidos: this.state.pedidos.slice(0, 250), fotos: this.state.fotos.slice(0, 20) };
      try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* seguimos en memoria */ }
    }
    this.canal?.postMessage("sync");
  }

  private emit() { this.listeners.forEach((l) => l()); }

  getState() { return this.state; }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  async dispatch(a: Accion) {
    const fresco = this.cargar();
    if (fresco) this.state = fresco; // evitar pisar cambios de otra pestaña
    const next = reducir(this.state, a, { now: Date.now(), uid: nuevoId });
    if (next === this.state) return;
    this.state = next;
    this.guardar();
    this.emit();
  }

  reset() {
    this.state = crearEstadoInicial();
    this.guardar();
    this.emit();
  }
}

export const supabaseConfigurado = () => !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
