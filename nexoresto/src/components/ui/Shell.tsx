"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3, Bell, Bike, Boxes, CalendarDays, ChefHat, ChevronLeft, CircleUserRound, Cpu, LayoutGrid, LogOut, Martini,
  Megaphone, MonitorPlay, QrCode, Receipt, ShieldCheck, Wallet,
} from "lucide-react";
import { Logo, Badge } from "./kit";
import { cx, hhmmss } from "@/lib/format";
import type { Rol } from "@/lib/types";
import { guardarSesion, useBackend, useNexo, useNow, useSesion } from "@/lib/store/NexoProvider";
import { PinPad } from "./PinPad";
import { crashActivo } from "@/lib/exchangeEngine";

export interface NavItem { href: string; label: string; icon: ReactNode; roles: Rol[] }

export const NAV: NavItem[] = [
  { href: "/pos/salon", label: "Salón", icon: <LayoutGrid size={18} />, roles: ["mozo", "caja"] },
  { href: "/pos/caja", label: "Caja", icon: <Wallet size={18} />, roles: ["caja"] },
  { href: "/pos/reservas", label: "Reservas", icon: <CalendarDays size={18} />, roles: ["caja", "mozo"] },
  { href: "/pos/delivery", label: "Delivery", icon: <Bike size={18} />, roles: ["caja"] },
  { href: "/kds/cocina", label: "Cocina KDS", icon: <ChefHat size={18} />, roles: ["cocina"] },
  { href: "/kds/barra", label: "Barra BDS", icon: <Martini size={18} />, roles: ["bartender"] },
  { href: "/cm", label: "Community", icon: <Megaphone size={18} />, roles: ["cm"] },
  { href: "/admin/dashboard", label: "Dashboard", icon: <BarChart3 size={18} />, roles: [] },
  { href: "/admin/stock", label: "Stock y recetas", icon: <Boxes size={18} />, roles: [] },
  { href: "/admin/auditoria", label: "Auditoría", icon: <Receipt size={18} />, roles: [] },
  { href: "/cadete", label: "Cadete", icon: <Bike size={18} />, roles: ["cadete"] },
  { href: "/superadmin", label: "Super Admin", icon: <Cpu size={18} />, roles: ["super_admin"] },
];

export const ROL_LABEL: Record<Rol, string> = {
  super_admin: "Super Admin", jefe: "Dueño / Gerente", caja: "Caja", mozo: "Mozo", cocina: "Cocina", bartender: "Barra",
  pantalla_tv: "Pantalla TV", cm: "Community Manager", cadete: "Cadete",
};

/** El jefe accede a todo lo del bar; el super_admin además al panel técnico. */
export const puede = (rol: Rol | undefined, roles: Rol[]) => !!rol && (rol === "super_admin" || rol === "jefe" || roles.includes(rol));

/** Layout de las pantallas internas: sidebar por rol + control de acceso por PIN. */
export function Shell({ children, roles, titulo, acciones, sinSidebar, full }: { children: ReactNode; roles: Rol[]; titulo?: ReactNode; acciones?: ReactNode; sinSidebar?: boolean; full?: boolean }) {
  const sesion = useSesion();
  const [listo, setListo] = useState(false);
  useEffect(() => setListo(true), []);
  if (!listo) return null;
  if (!sesion || !puede(sesion.rol, roles)) return <Acceso roles={roles} rechazado={!!sesion} />;
  return (
    <div className="flex min-h-dvh bg-bg">
      {!sinSidebar && <Sidebar rol={sesion.rol} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar titulo={titulo} acciones={acciones} />
        <main className={cx("min-w-0 flex-1", !full && "p-4 lg:p-6")}>{children}</main>
      </div>
    </div>
  );
}

function Sidebar({ rol }: { rol: Rol }) {
  const path = usePathname();
  const items = NAV.filter((n) => puede(rol, n.roles) && (n.href !== "/superadmin" || rol === "super_admin"));
  return (
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-panel/60 px-3 py-4 lg:flex">
      <Link href="/" className="mb-6 px-2"><Logo /></Link>
      <nav className="flex flex-1 flex-col gap-1">
        {items.map((n) => (
          <Link key={n.href} href={n.href}
            className={cx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition", path?.startsWith(n.href) ? "bg-up/10 font-semibold text-up" : "text-mute hover:bg-raised hover:text-ink")}>
            {n.icon}{n.label}
          </Link>
        ))}
        <div className="my-3 border-t border-line" />
        <Link href="/tv/bar-central" target="_blank" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-mute hover:bg-raised hover:text-ink"><MonitorPlay size={18} />Pantalla NYSE</Link>
        <Link href="/menu/bar-central/12" target="_blank" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-mute hover:bg-raised hover:text-ink"><QrCode size={18} />Carta QR</Link>
      </nav>
      <ModoBadge />
    </aside>
  );
}

function ModoBadge() {
  const b = useBackend();
  return (
    <div className="rounded-xl border border-line bg-bg/60 p-3 text-[11px] leading-relaxed text-mute">
      <div className="mb-1 flex items-center gap-2 font-semibold text-ink"><ShieldCheck size={14} className="text-up" />{b.modo === "demo" ? "Modo demo" : "Supabase"}</div>
      {b.modo === "demo" ? "Datos locales sincronizados entre pestañas. Configurá Supabase para producción." : "Conectado en tiempo real · RLS activo."}
    </div>
  );
}

function Topbar({ titulo, acciones }: { titulo?: ReactNode; acciones?: ReactNode }) {
  const sesion = useSesion()!;
  const now = useNow(1000);
  const crash = useNexo((s) => s.crash);
  const notifs = useNexo((s) => s.notificaciones.filter((n) => !n.leida && (sesion.rol === "jefe" || n.para === "todos" || (n.para === "mozo" && sesion.rol === "mozo") || (n.para === "caja" && sesion.rol === "caja"))).length);
  const barNombre = useNexo((s) => s.bar.nombre);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur lg:px-6">
      <Link href="/" className="lg:hidden"><ChevronLeft size={20} className="text-mute" /></Link>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{titulo}</div>
        <div className="truncate text-[11px] text-mute">{barNombre}</div>
      </div>
      {crashActivo(crash, now) && <Badge tono="crash" dot className="animate-blink">Market crash · {Math.max(0, Math.ceil((new Date(crash!.fin_at).getTime() - now) / 60000))} min</Badge>}
      {acciones}
      <span className="hidden font-mono text-sm tabular-nums text-mute sm:block">{hhmmss(now)}</span>
      {notifs > 0 && (
        <span className="relative grid h-9 w-9 place-items-center rounded-full bg-raised text-mute" title={`${notifs} avisos`}>
          <Bell size={16} /><span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-down px-1 text-[10px] font-bold text-white">{notifs}</span>
        </span>
      )}
      <div className="flex items-center gap-2 rounded-full border border-line bg-panel py-1 pl-1 pr-3">
        <CircleUserRound size={22} className="text-up" />
        <div className="hidden leading-tight sm:block">
          <div className="text-xs font-semibold">{sesion.nombre}</div>
          <div className="text-[10px] text-mute">{ROL_LABEL[sesion.rol]}</div>
        </div>
      </div>
      <button onClick={() => guardarSesion(null)} className="grid h-9 w-9 place-items-center rounded-full text-mute hover:bg-raised hover:text-ink" title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={16} /></button>
    </header>
  );
}

function Acceso({ roles, rechazado }: { roles: Rol[]; rechazado: boolean }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 block text-center"><Logo size="text-2xl" /></Link>
        {rechazado && <p className="mb-4 rounded-xl border border-warn/40 bg-warn/10 p-3 text-center text-sm text-warn">Tu rol no tiene acceso a esta pantalla. Ingresá con otro PIN.</p>}
        <PinPad roles={roles} />
      </div>
    </div>
  );
}
