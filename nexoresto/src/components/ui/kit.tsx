"use client";
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { X } from "lucide-react";
import { cx } from "@/lib/format";

export function Logo({ className, size = "text-lg" }: { className?: string; size?: string }) {
  return (
    <span className={cx("font-sans font-extrabold tracking-tight text-ink", size, className)}>
      NE<span className="text-up">X</span>ORESTO
    </span>
  );
}

export function Panel({ children, className, title, action, pad = true }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; pad?: boolean }) {
  return (
    <section className={cx("rounded-2xl border border-line bg-card/80", pad && "p-4", className)}>
      {(title || action) && (
        <header className={cx("mb-3 flex items-center justify-between gap-3", !pad && "px-4 pt-4")}>
          {title && <h3 className="eyebrow">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

type Tono = "up" | "down" | "warn" | "info" | "violet" | "mute" | "crash";
const TONOS: Record<Tono, string> = {
  up: "border-up/40 bg-up/10 text-up",
  down: "border-down/40 bg-down/10 text-down",
  warn: "border-warn/40 bg-warn/10 text-warn",
  info: "border-info/40 bg-info/10 text-info",
  violet: "border-violet/40 bg-violet/10 text-violet",
  mute: "border-line bg-raised text-mute",
  crash: "border-crash/60 bg-crash/15 text-crash",
};
export function Badge({ children, tono = "mute", className, dot }: { children: ReactNode; tono?: Tono; className?: string; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", TONOS[tono], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

type Variante = "primary" | "ghost" | "danger" | "warn" | "outline" | "info";
const VAR: Record<Variante, string> = {
  primary: "bg-up text-[#04140c] hover:brightness-110 active:brightness-95",
  ghost: "bg-raised text-ink hover:bg-[#1c2834] border border-line",
  outline: "border border-line text-ink hover:border-mute bg-transparent",
  danger: "bg-down text-white hover:brightness-110",
  warn: "bg-warn text-[#1c1300] hover:brightness-110",
  info: "bg-info text-white hover:brightness-110",
};
export function Btn({ variant = "ghost", size = "md", className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variante; size?: "sm" | "md" | "lg" | "xl" }) {
  const sz = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-14 px-5 text-base", xl: "h-16 px-6 text-lg" }[size];
  return (
    <button
      {...p}
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-up",
        VAR[variant], sz, className,
      )}
    >
      {children}
    </button>
  );
}

export function Kpi({ label, value, delta, tono, hint, className }: { label: string; value: ReactNode; delta?: ReactNode; tono?: "up" | "down" | "warn"; hint?: string; className?: string }) {
  return (
    <div className={cx("min-w-0 rounded-2xl border border-line bg-card/80 p-4", className)} title={hint}>
      <div className="eyebrow">{label}</div>
      <div className="mt-2 truncate font-mono text-xl font-semibold tabular-nums text-ink 2xl:text-2xl">{value}</div>
      {delta != null && <div className={cx("mt-1 font-mono text-xs", tono === "down" ? "text-down" : tono === "warn" ? "text-warn" : "text-up")}>{delta}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose} role="dialog" aria-modal>
      <div
        className={cx("flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-panel shadow-2xl animate-slideIn sm:rounded-3xl", wide ? "sm:max-w-5xl" : "sm:max-w-lg")}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-mute hover:bg-raised hover:text-ink" aria-label="Cerrar"><X size={18} /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <footer className="border-t border-line px-5 py-4">{footer}</footer>}
      </div>
    </div>
  );
}

/** Toasts globales simples */
type ToastT = { id: number; texto: string; tono: "up" | "down" | "warn" | "info" };
const toastListeners = new Set<(t: ToastT) => void>();
export function toast(texto: string, tono: ToastT["tono"] = "up") {
  const t = { id: Date.now() + Math.random(), texto, tono };
  toastListeners.forEach((l) => l(t));
}
export function Toaster() {
  const [items, setItems] = useState<ToastT[]>([]);
  useEffect(() => {
    const l = (t: ToastT) => {
      setItems((x) => [...x, t]);
      setTimeout(() => setItems((x) => x.filter((y) => y.id !== t.id)), 3800);
    };
    toastListeners.add(l);
    return () => { toastListeners.delete(l); };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className={cx("animate-slideIn rounded-xl border bg-panel/95 px-4 py-3 text-sm font-medium shadow-xl backdrop-blur", {
          up: "border-up/40 text-up", down: "border-down/50 text-down", warn: "border-warn/40 text-warn", info: "border-info/40 text-info",
        }[t.tono])}>{t.texto}</div>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cx("inline-flex rounded-xl border border-line bg-panel p-1", className)} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx("rounded-lg px-3 py-1.5 text-sm font-medium transition", value === o.value ? "bg-up/15 text-up" : "text-mute hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1.5 block text-xs font-medium text-mute">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm text-ink placeholder:text-dim focus:border-up/60 focus:outline-none";

export function Empty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="grid place-items-center gap-2 py-10 text-center text-mute">
      {icon}
      <div className="font-medium text-ink/80">{title}</div>
      {hint && <div className="max-w-xs text-sm">{hint}</div>}
    </div>
  );
}

export function Trend({ v, className }: { v: number; className?: string }) {
  if (v === 0) return <span className={cx("font-mono text-mute", className)}>■ 0,0 %</span>;
  return (
    <span className={cx("font-mono tabular-nums", v > 0 ? "text-up" : "text-down", className)}>
      {v > 0 ? "▲" : "▼"} {v > 0 ? "+" : "−"}{Math.abs(v).toFixed(1).replace(".", ",")} %
    </span>
  );
}
