"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3, Bell, BookOpen, FileBarChart, Menu, Smartphone, Store, Users, X, Bike, Boxes, CalendarDays, ChefHat, ChevronLeft, CircleUserRound, Cpu, LayoutGrid, LogOut, Martini,
  Megaphone, MonitorPlay, QrCode, Receipt, ShieldCheck, Wallet,
} from "lucide-react";
import { Logo, Badge } from "./kit";
import { cx, hhmmss } from "@/lib/format";
import type { Rol } from "@/lib/types";
import { guardarSesion, useBackend, useConexion, useNexo, useNow, useSesion } from "@/lib/store/NexoProvider";
import { PinPad } from "./PinPad";
import { crashActivo } from "@/lib/exchangeEngine";

export interface NavItem { href: string; label: string; icon: ReactNode; roles: Rol[]; grupo: "Operación" | "Gestión" | "Configuración" | "Pantallas"; nueva?: boolean }

export const NAV: NavItem[] = [
  { grupo: "Operación", href: "/pos/salon", label: "Salón", icon: <LayoutGrid size={18} />, roles: ["mozo", "caja"] },
  { grupo: "Operación", href: "/pos/caja", label: "Caja", icon: <Wallet size={18} />, roles: ["caja"] },
  { grupo: "Operación", href: "/pos/reservas", label: "Reservas", icon: <CalendarDays size={18} />, roles: ["caja", "mozo"] },
  { grupo: "Operación", href: "/pos/delivery", label: "Delivery", icon: <Bike size={18} />, roles: ["caja"] },
  { grupo: "Operación", href: "/kds/cocina", label: "Cocina", icon: <ChefHat size={18} />, roles: ["cocina"] },
  { grupo: "Operación", href: "/kds/barra", label: "Barra", icon: <Martini size={18} />, roles: ["bartender"] },
  { grupo: "Operación", href: "/cadete", label: "Mis viajes", icon: <Bike size={18} />, roles: ["cadete"] },
  { grupo: "Operación", href: "/cm", label: "Promos y Crash", icon: <Megaphone size={18} />, roles: ["cm"] },
  { grupo: "Gestión", href: "/admin/dashboard", label: "Resumen", icon: <BarChart3 size={18} />, roles: [] },
  { grupo: "Gestión", href: "/admin/reportes", label: "Reportes", icon: <FileBarChart size={18} />, roles: [] },
  { grupo: "Gestión", href: "/admin/stock", label: "Stock y compras", icon: <Boxes size={18} />, roles: [] },
  { grupo: "Gestión", href: "/admin/auditoria", label: "Auditoría", icon: <Receipt size={18} />, roles: [] },
  { grupo: "Configuración", href: "/admin/carta", label: "Carta y precios", icon: <BookOpen size={18} />, roles: [] },
  { grupo: "Configuración", href: "/admin/mesas", label: "Mesas y QR", icon: <QrCode size={18} />, roles: [] },
  { grupo: "Configuración", href: "/admin/equipo", label: "Equipo", icon: <Users size={18} />, roles: [] },
  { grupo: "Configuración", href: "/admin/bar", label: "Mi bar", icon: <Store size={18} />, roles: [] },
  { grupo: "Configuración", href: "/superadmin", label: "Bares y licencias", icon: <Cpu size={18} />, roles: ["super_admin"] },
  { grupo: "Pantallas", href: "/tv/bar-central", label: "Pantalla del salón", icon: <MonitorPlay size={18} />, roles: ["mozo", "caja", "cm", "pantalla_tv"] },
  { grupo: "Pantallas", href: "/menu/bar-central/1", label: "Carta QR", icon: <Smartphone size={18} />, roles: ["mozo", "caja", "cm"] },
];

/** Pantalla de inicio de cada rol al entrar con PIN. */
export function inicioDeRol(rol: Rol) {
  return ({ super_admin: "/superadmin", jefe: "/admin/dashboard", caja: "/pos/caja", mozo: "/pos/salon", cocina: "/kds/cocina", bartender: "/kds/barra", pantalla_tv: "/tv/bar-central", cm: "/cm", cadete: "/cadete" } as Record<Rol, string>)[rol];
}

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

function Navegacion({ rol, onIr }: { rol: Rol; onIr?: () => void }) {
  const path = usePathname();
  const slug = useNexo((s) => s.bar.slug);
  const items = NAV.filter((n) => puede(rol, n.roles) && (n.href !== "/superadmin" || rol === "super_admin") && (n.href !== "/cadete" || rol === "cadete"));
  const grupos = ["Operación", "Gestión", "Configuración", "Pantallas"] as const;
  return (
    <nav className="flex flex-1 flex-col gap-4 overflow-y-auto scroll-thin">
      {grupos.map((g) => {
        const its = items.filter((n) => n.grupo === g);
        if (!its.length) return null;
        return (
          <div key={g}>
            <div className="mb-1 px-3 text-[11px] font-medium text-dim">{g}</div>
            <div className="flex flex-col gap-0.5">
              {its.map((n) => {
                const href = n.href.replace("bar-central", slug);
                const activo = path?.startsWith(n.href.split("/").slice(0, 3).join("/"));
                return (
                  <Link key={n.href} href={href} onClick={onIr}
                    className={cx("press flex items-center gap-3 rounded-xl px-3 py-2 text-sm", activo ? "bg-up/10 font-semibold text-up" : "text-ink/75 hover:bg-raised hover:text-ink")}>
                    <span className={activo ? "text-up" : "text-mute"}>{n.icon}</span>{n.label}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function Sidebar({ rol }: { rol: Rol }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-5 border-r border-line bg-panel/60 px-3 py-4 lg:flex">
      <SelectorBar />
      <Navegacion rol={rol} />
    </aside>
  );
}

/** Nombre del bar; el super admin puede cambiar de bar desde acá. */
function SelectorBar() {
  const s = useNexo();
  const sesion = useSesion();
  const backend = useBackend();
  const multi = sesion?.rol === "super_admin" && !!backend.cambiarBar && s.bares.length > 1;
  return (
    <div className="px-2">
      <Logo />
      {multi ? (
        <select value={s.bar.id} onChange={(e) => backend.cambiarBar!(e.target.value)} className="mt-2 h-9 w-full rounded-lg border border-line bg-bg px-2 text-sm" aria-label="Bar">
          {s.bares.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
        </select>
      ) : <div className="mt-1 truncate text-sm text-mute">{s.bar.nombre}</div>}
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
      <MenuMovil />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{titulo}</div>
        <div className="truncate text-[11px] text-mute lg:hidden">{barNombre}</div>
      </div>
      <IndicadorConexion />
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

function MenuMovil() {
  const sesion = useSesion();
  const [abierto, setAbierto] = useState(false);
  if (!sesion) return null;
  return (
    <>
      <button onClick={() => setAbierto(true)} className="press grid h-9 w-9 place-items-center rounded-lg text-mute hover:bg-raised lg:hidden" aria-label="Abrir menú"><Menu size={20} /></button>
      {abierto && (
        <div className="fixed inset-0 z-50 animate-fadeIn bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setAbierto(false)}>
          <div className="flex h-full w-72 max-w-[85vw] animate-[slideIn_.22s_cubic-bezier(0.23,1,0.32,1)] flex-col gap-5 border-r border-line bg-panel px-3 py-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between"><SelectorBar /><button onClick={() => setAbierto(false)} className="grid h-9 w-9 place-items-center rounded-lg text-mute" aria-label="Cerrar menú"><X size={18} /></button></div>
            <Navegacion rol={sesion.rol} onIr={() => setAbierto(false)} />
          </div>
        </div>
      )}
    </>
  );
}

function IndicadorConexion() {
  const { online, pendientes } = useConexion();
  if (online && !pendientes) return null;
  return (
    <Badge tono={online ? "info" : "warn"} dot className={online ? "" : "animate-blink"}>
      {online ? `Sincronizando ${pendientes}…` : `Sin conexión${pendientes ? ` · ${pendientes} en cola` : " · se guarda en el equipo"}`}
    </Badge>
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
