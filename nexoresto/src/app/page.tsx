"use client";
import Link from "next/link";
import { ArrowUpRight, BarChart3, Bike, CalendarDays, ChefHat, Cpu, LayoutGrid, Martini, Megaphone, MonitorPlay, QrCode, RotateCcw, Wallet } from "lucide-react";
import { Badge, Btn, Logo, Trend, toast } from "@/components/ui/kit";
import { ProductIcon } from "@/components/icons/ProductIcon";
import { useBackend, useDispatch, useNexo, useNow } from "@/lib/store/NexoProvider";
import { money, hhmmss } from "@/lib/format";
import { cx } from "@/lib/format";

const MODULOS = [
  { href: "/tv/bar-central", t: "Pantalla NYSE", d: "Cotizaciones · ticker · fotos · ranking", tag: "TV pública", tono: "down", icon: MonitorPlay, pin: "público" },
  { href: "/menu/bar-central/12", t: "Cliente QR", d: "Menú · carrito · fotos · votos · seguimiento", tag: "WebApp", tono: "info", icon: QrCode, pin: "público" },
  { href: "/pos/salon", t: "Mozos", d: "Mapa de mesas · pedidos · modificadores", tag: "Salón", tono: "up", icon: LayoutGrid, pin: "3333" },
  { href: "/pos/caja", t: "Caja / Adicionista", d: "Turnos · arqueo ciego · cobros multipago", tag: "POS", tono: "up", icon: Wallet, pin: "2222" },
  { href: "/pos/reservas", t: "Reservas", d: "Calendario por franja · lista de espera", tag: "POS", tono: "up", icon: CalendarDays, pin: "2222" },
  { href: "/pos/delivery", t: "Delivery GPS", d: "Asignación de cadetes · mapa en vivo", tag: "POS", tono: "up", icon: Bike, pin: "2222" },
  { href: "/kds/cocina", t: "Cocina KDS", d: "Comandas · prioridad · semáforo", tag: "Cocina", tono: "warn", icon: ChefHat, pin: "4444" },
  { href: "/kds/barra", t: "Barra BDS", d: "Recetas · alertas Crash · despacho", tag: "Bartender", tono: "warn", icon: Martini, pin: "5555" },
  { href: "/cm", t: "Community Manager", d: "Market Crash · moderación · eventos", tag: "CM", tono: "crash", icon: Megaphone, pin: "6666" },
  { href: "/admin/dashboard", t: "Dueño / Gerente", d: "Rentabilidad · stock · auditoría · IA", tag: "Jefes", tono: "info", icon: BarChart3, pin: "1111" },
  { href: "/cadete", t: "Cadete", d: "Viajes · GPS en vivo · entregado", tag: "Delivery", tono: "violet", icon: Bike, pin: "7777" },
  { href: "/superadmin", t: "Super Admin", d: "Bares · licencias · logs · Exchange", tag: "Programador", tono: "violet", icon: Cpu, pin: "9999" },
] as const;

export default function Inicio() {
  const productos = useNexo((s) => s.productos.filter((p) => p.destacado).slice(0, 3));
  const backend = useBackend();
  const dispatch = useDispatch();
  const now = useNow(1000);
  const simulacion = useNexo((s) => s.simulacion);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:pt-14">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Logo size="text-xl" />
        <div className="flex items-center gap-2">
          <Badge tono={backend.modo === "demo" ? "warn" : "up"} dot>{backend.modo === "demo" ? "Modo demo local" : "Supabase en vivo"}</Badge>
          {backend.modo === "demo" && (
            <>
              <Btn size="sm" variant="outline" onClick={() => dispatch({ type: "toggleSimulacion" })}>{simulacion ? "Pausar clientes simulados" : "Simular clientes"}</Btn>
              <Btn size="sm" variant="outline" onClick={() => { backend.reset?.(); toast("Demo reiniciada"); }}><RotateCcw size={14} />Reiniciar</Btn>
            </>
          )}
        </div>
      </header>

      <section className="mt-12 grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="eyebrow !text-up">Plataforma gastronómica · tiempo real</p>
          <h1 className="mt-4 text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl">
            NE<span className="text-up">X</span>ORESTO
          </h1>
          <p className="mt-2 text-xs tracking-[0.5em] text-mute">GASTRONOMÍA EN TIEMPO REAL</p>
          <p className="mt-8 max-w-xl text-2xl font-semibold leading-snug sm:text-3xl">
            El sistema gastronómico todo-en-uno, inspirado en el <span className="text-up">mercado.</span>
          </p>
          <p className="mt-4 max-w-xl text-mute">
            Caja, mozos, cocina, barra, delivery, carta QR y pantalla de bolsa comparten una sola fuente de verdad. Abrí cada módulo en una pestaña
            o dispositivo distinto: todo cambia al instante.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-mute">
            {["Multi-sucursal", "Tiempo real", "Offline-resilient", "RBAC por rol", "Motor Exchange", "IA predictiva"].map((t) => (
              <span key={t} className="rounded-full border border-line px-3 py-1">◆ {t}</span>
            ))}
          </div>
        </div>

        <Link href="/tv/bar-central" className="group block rotate-[-2deg] rounded-3xl border border-line bg-black p-5 shadow-[0_40px_80px_-30px_rgba(30,224,143,.25)] transition hover:rotate-0">
          <div className="flex items-center justify-between">
            <Logo />
            <span className="font-mono text-2xl tabular-nums">{hhmmss(now)}</span>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {productos.map((p) => (
              <div key={p.id} className="rounded-xl border border-line bg-[#05080c] p-3">
                <div className="truncate font-mono text-xs font-semibold uppercase tracking-wide">{p.nombre}</div>
                <div className="mt-2 flex items-end justify-between gap-1">
                  <div>
                    <div className={cx("font-mono text-xl font-bold tabular-nums", p.variacion_porcentaje >= 0 ? "text-neon" : "text-crash")}>{money(p.precio_actual)}</div>
                    <Trend v={p.variacion_porcentaje} className="text-[11px]" />
                  </div>
                  <ProductIcon icono={p.icono} size={40} tile={false} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-end gap-1 text-xs text-mute group-hover:text-up">Abrir pantalla del salón <ArrowUpRight size={14} /></div>
        </Link>
      </section>

      <section className="mt-16">
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-2xl font-bold">Todo conectado en un solo núcleo</h2>
          <span className="hidden text-sm text-mute sm:block">Nueve perfiles · un modelo de datos · cada rol ve lo que necesita</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULOS.map((m) => (
            <Link key={m.href} href={m.href} className="group flex items-start gap-4 rounded-2xl border border-line bg-card/70 p-4 transition hover:-translate-y-0.5 hover:border-up/40 hover:bg-card">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-raised text-up"><m.icon size={20} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{m.t}</span>
                  <Badge tono={m.tono}>{m.tag}</Badge>
                </span>
                <span className="mt-1 block text-sm text-mute">{m.d}</span>
                <span className="mt-2 block font-mono text-[11px] text-dim">{m.pin === "público" ? "acceso público" : `PIN demo ${m.pin}`}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <footer className="mt-16 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-6 text-xs text-dim">
        <span><Logo size="text-xs" /> · Tu bar, en modo futuro.</span>
        <span>Next.js · Supabase · Realtime · RLS · Claude</span>
      </footer>
    </main>
  );
}
