"use client";
import { useCallback, useEffect, useState } from "react";
import { Delete } from "lucide-react";
import { cx } from "@/lib/format";
import { guardarSesion, useBackend, useNexo } from "@/lib/store/NexoProvider";
import type { Rol } from "@/lib/types";
import { sonido } from "@/lib/sound";

const ROL_CORTO: Record<Rol, string> = { super_admin: "sistema", jefe: "encargado", caja: "caja", mozo: "mozo", cocina: "cocina", bartender: "barra", pantalla_tv: "TV", cm: "community", cadete: "cadete" };

/** Ingreso rápido con PIN de 4 dígitos. Bloquea 30 s tras 5 intentos fallidos. */
export function PinPad({ roles, onOk }: { roles?: Rol[]; onOk?: () => void }) {
  const backend = useBackend();
  const usuarios = useNexo((s) => s.usuarios);
  const bar = useNexo((s) => s.bar.nombre);
  const barId = useNexo((s) => s.bar.id);
  const bares = useNexo((s) => s.bares);
  const [verEquipo, setVerEquipo] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [intentos, setIntentos] = useState(0);
  const [bloqueo, setBloqueo] = useState(0);
  const [cargando, setCargando] = useState(false);

  const verificar = useCallback(async (p: string) => {
    if (Date.now() < bloqueo) return;
    setCargando(true);
    let u: { id: string; nombre: string; rol: Rol; bar_id: string | null } | undefined;
    if (backend.modo === "demo") {
      u = usuarios.find((x) => x.pin === p && x.activo);
    } else {
      const r = await fetch("/api/auth/pin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin: p }) });
      if (r.ok) u = await r.json();
    }
    setCargando(false);
    if (!u) {
      const n = intentos + 1;
      setIntentos(n);
      if (n >= 5) { setBloqueo(Date.now() + 30_000); setIntentos(0); setError("Demasiados intentos. Esperá 30 segundos."); }
      else setError("PIN incorrecto");
      setPin("");
      sonido.alerta();
      return;
    }
    sonido.listo();
    guardarSesion({ usuario_id: u.id, nombre: u.nombre, rol: u.rol, bar_id: u.bar_id, desde: Date.now() });
    onOk?.();
  }, [backend.modo, usuarios, intentos, bloqueo, onOk]);

  const tecla = useCallback((k: string) => {
    sonido.desbloquear();
    setError(null);
    if (k === "⌫") return setPin((p) => p.slice(0, -1));
    setPin((p) => {
      const n = (p + k).slice(0, 4);
      if (n.length === 4) setTimeout(() => verificar(n), 120);
      return n;
    });
  }, [verificar]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) tecla(e.key);
      else if (e.key === "Backspace") tecla("⌫");
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [tecla]);

  const sugeridos = usuarios.filter((u) => u.activo && (!roles || roles.length === 0 || roles.includes(u.rol) || u.rol === "jefe" || u.rol === "super_admin"))
    .filter((u, i, arr) => arr.findIndex((x) => x.rol === u.rol) === i);

  return (
    <div className="rounded-3xl border border-line bg-panel p-6 shadow-2xl">
      <h1 className="text-center text-2xl font-semibold">Ingresá tu PIN</h1>
      {bares.length > 1 && backend.cambiarBar ? (
        <select value={barId} onChange={(e) => backend.cambiarBar!(e.target.value)} className="mx-auto mt-2 block h-9 rounded-lg border border-line bg-bg px-3 text-sm" aria-label="Bar">
          {bares.filter((b) => b.estado_licencia !== "suspendida").map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>
      ) : <p className="mt-1 text-center text-sm text-mute">{bar}</p>}
      <div className={cx("my-6 flex justify-center gap-4", error && "animate-[blink_.3s_2]")} aria-live="polite">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cx("h-4 w-4 rounded-full border-2 transition", i < pin.length ? "border-up bg-up shadow-[0_0_12px_#1ee08f]" : "border-line bg-transparent")} />
        ))}
      </div>
      <div className="h-5 text-center text-sm text-down">{error}</div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"].map((k) => (
          <button key={k} disabled={cargando}
            onClick={() => (k === "OK" ? pin.length === 4 && verificar(pin) : tecla(k))}
            className="press grid h-16 place-items-center rounded-2xl border border-line bg-card font-mono text-2xl text-ink active:bg-raised hover:border-mute"
            aria-label={k === "⌫" ? "Borrar" : k}>
            {k === "⌫" ? <Delete size={22} /> : k}
          </button>
        ))}
      </div>
      {backend.modo === "demo" && (
        <div className="mt-5 border-t border-line pt-4 text-center">
          <button onClick={() => setVerEquipo((v) => !v)} className="text-xs text-mute underline-offset-4 hover:text-ink hover:underline">{verEquipo ? "Ocultar equipo" : "¿Olvidaste tu PIN? Ver equipo de prueba"}</button>
          {verEquipo && (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {sugeridos.map((u) => (
                <button key={u.id} onClick={() => verificar(u.pin)} className="press rounded-full border border-line px-2.5 py-1 text-[11px] text-mute hover:border-up/50 hover:text-up">
                  {u.nombre.split(" ")[0]} · {ROL_CORTO[u.rol]} · <span className="font-mono">{u.pin}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
