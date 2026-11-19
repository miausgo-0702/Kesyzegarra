"use client";
// Portada: muestra el producto real (cotizaciones en vivo, fotos de la carta) y da
// acceso directo a cada pantalla con su PIN de demo.
import Link from "next/link";
import { ArrowRight, BarChart3, Bike, CalendarDays, ChefHat, Check, Cpu, LayoutGrid, Martini, Megaphone, MonitorPlay, QrCode, RotateCcw, Wallet, Minus, BookOpen, FileBarChart } from "lucide-react";
import { Badge, Btn, Logo, toast } from "@/components/ui/kit";
import { ASSET_BASE, ProductIcon } from "@/components/icons/ProductIcon";
import { Sparkline } from "@/components/ui/Sparkline";
import { useBackend, useDispatch, useNexo, useNow } from "@/lib/store/NexoProvider";
import { cx, hhmmss, money } from "@/lib/format";
import { crashActivo } from "@/lib/exchangeEngine";

const ROLES = [
  { grupo: "Salón y caja", items: [
    { href: "/pos/salon", t: "Mozos", d: "Mapa de mesas, comanda táctil, mover y unir mesas", icon: LayoutGrid, pin: "3333" },
    { href: "/pos/caja", t: "Caja", d: "Cobro multipago, venta rápida, arqueo ciego", icon: Wallet, pin: "2222" },
    { href: "/pos/reservas", t: "Reservas", d: "Calendario por franja y lista de espera", icon: CalendarDays, pin: "2222" },
    { href: "/pos/delivery", t: "Delivery", d: "Cadetes propios con GPS, sin comisiones", icon: Bike, pin: "2222" },
  ] },
  { grupo: "Producción", items: [
    { href: "/kds/cocina", t: "Cocina", d: "Comandas con semáforo y producción por lotes", icon: ChefHat, pin: "4444" },
    { href: "/kds/barra", t: "Barra", d: "Recetas a la vista y prioridad en Market Crash", icon: Martini, pin: "5555" },
    { href: "/cadete", t: "Cadete", d: "Viaje con GPS y entrega en un toque", icon: Bike, pin: "7777" },
  ] },
  { grupo: "Gestión", items: [
    { href: "/admin/dashboard", t: "Dashboard", d: "Ganancia neta real, alertas y copiloto IA", icon: BarChart3, pin: "1111" },
    { href: "/admin/carta", t: "Carta y precios", d: "Rango del Exchange, recetas y agotados", icon: BookOpen, pin: "1111" },
    { href: "/admin/reportes", t: "Reportes", d: "Cierre Z, ventas por mozo, impacto del Exchange", icon: FileBarChart, pin: "1111" },
    { href: "/cm", t: "Community", d: "Market Crash, fotos, eventos y promos", icon: Megaphone, pin: "6666" },
    { href: "/superadmin", t: "Super Admin", d: "Bares, licencias, reglas del motor y logs", icon: Cpu, pin: "9999" },
  ] },
  { grupo: "Para el público", items: [
    { href: "/tv/bar-central", t: "Pantalla del salón", d: "Cotizaciones, ticker, fotos y ranking", icon: MonitorPlay, pin: "" },
    { href: "/menu/bar-central/12", t: "Carta QR", d: "Pedir, subir una foto y votar desde la mesa", icon: QrCode, pin: "" },
  ] },
];

const COMPARATIVA: [string, string][] = [
  ["Precios que cotizan según la demanda, con piso de margen y tope", "Lista de precios fija"],
  ["Pantalla de bolsa para el salón y Market Crash en un botón", "Promos impresas o en redes"],
  ["Carta QR con fotos, pedido a la mesa, votación y cupón automático", "Carta PDF o app aparte"],
  ["Delivery propio con seguimiento GPS para el cliente", "Apps con comisión por pedido"],
  ["Stock que se descuenta por receta y agotados que se reflejan solos", "Planillas y carga manual"],
  ["Sigue tomando pedidos sin internet y sincroniza al volver", "Se frena si se corta la conexión"],
  ["IA que sugiere compras, promos y avisa demoras de cocina", "Reportes para leer después"],
];

export default function Inicio() {
  const s = useNexo();
  const backend = useBackend();
  const dispatch = useDispatch();
  const now = useNow(1000);
  const destacados = s.productos.filter((p) => p.destacado && p.es_cotizable_bolsa).slice(0, 4);
  const enCrash = crashActivo(s.crash, now);

  return (
    <main className="min-h-dvh bg-bg">
      {/* ---------- Hero: el bar de noche + la bolsa en vivo ---------- */}
      <section className="relative isolate overflow-hidden border-b border-line">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${ASSET_BASE}fotos/bar-barra.jpg`} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-35" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#05070a_8%,rgba(5,7,10,.86)_45%,rgba(5,7,10,.55)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-bg to-transparent" />

        <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:pb-24">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <Logo size="text-xl" />
            <nav className="flex items-center gap-2">
              {backend.modo === "demo" && (
                <>
                  <Badge tono="warn" dot>Demo con datos de ejemplo</Badge>
                  <Btn size="sm" variant="outline" onClick={() => dispatch({ type: "toggleSimulacion" })}>{s.simulacion ? "Pausar clientes" : "Simular clientes"}</Btn>
                  <Btn size="sm" variant="outline" onClick={() => { backend.reset?.(); toast("Demo reiniciada"); }} aria-label="Reiniciar demo"><RotateCcw size={14} /></Btn>
                </>
              )}
              <Link href="/login"><Btn size="sm" variant="primary">Entrar con PIN</Btn></Link>
            </nav>
          </header>

          <div className="mt-14 grid items-center gap-12 lg:mt-20 lg:grid-cols-[1fr_1.05fr]">
            <div className="animate-[slideIn_.6s_cubic-bezier(0.23,1,0.32,1)_both]">
              <h1 className="max-w-xl text-balance text-5xl font-extrabold leading-[0.98] tracking-[-0.035em] sm:text-6xl">
                Tu bar cotiza <span className="text-up">en vivo</span>.
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink/80">
                Caja, mozos, cocina, barra, delivery y carta QR en un solo sistema. Y algo que ningún POS tiene: los tragos suben y bajan con la demanda, con un piso que protege tu margen.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/tv/bar-central"><Btn size="lg" variant="primary"><MonitorPlay size={18} />Ver la pantalla del salón</Btn></Link>
                <Link href="/menu/bar-central/12"><Btn size="lg" variant="outline"><QrCode size={18} />Probar la carta QR</Btn></Link>
              </div>
              <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-white/10 pt-6">
                <div><dt className="text-xs text-mute">Pedido en cocina</dt><dd className="mt-1 font-mono text-2xl font-semibold">&lt;1 s</dd></div>
                <div><dt className="text-xs text-mute">Ajuste máximo</dt><dd className="mt-1 font-mono text-2xl font-semibold">±3 %</dd></div>
                <div><dt className="text-xs text-mute">Piso de margen</dt><dd className="mt-1 font-mono text-2xl font-semibold">×1,35</dd></div>
              </dl>
            </div>

            {/* Producto real: la bolsa del bar, viva */}
            <Link href="/tv/bar-central" className="group block animate-[popIn_.7s_.1s_cubic-bezier(0.23,1,0.32,1)_both]" aria-label="Abrir la pantalla del salón">
              <div className={cx("lift overflow-hidden rounded-[22px] border bg-black/90 shadow-[0_40px_100px_-30px_rgba(0,0,0,.9)] backdrop-blur", enCrash ? "border-crash" : "border-white/10")}>
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
                  <span className="flex items-center gap-2 text-xs font-semibold text-neon"><span className="h-1.5 w-1.5 animate-blink rounded-full bg-neon" />EN VIVO · BAR CENTRAL</span>
                  <span className="font-mono text-lg tabular-nums text-white">{hhmmss(now)}</span>
                </div>
                {enCrash && <div className="bg-crash px-5 py-1.5 font-mono text-xs font-bold text-black">MARKET CRASH · {s.crash!.mensaje.toUpperCase()}</div>}
                <div className="grid grid-cols-2 gap-px bg-white/5">
                  {destacados.map((p) => {
                    const up = p.variacion_porcentaje >= 0;
                    return (
                      <div key={p.id} className="bg-black p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-mono text-xs font-semibold uppercase tracking-wider text-white/80">{p.nombre}</div>
                            <div key={p.precio_actual} className={cx("mt-1 font-mono text-2xl font-bold tabular-nums", up ? "text-neon animate-flashUp" : "text-crash animate-flashDown")}>{money(p.precio_actual)}</div>
                            <div className={cx("font-mono text-xs", up ? "text-neon" : "text-crash")}>{up ? "▲ +" : "▼ −"}{Math.abs(p.variacion_porcentaje).toFixed(1).replace(".", ",")}%</div>
                          </div>
                          <ProductIcon icono={p.icono} size={52} />
                        </div>
                        <div className="mt-2 h-14"><Sparkline data={(s.historial[p.id] ?? []).slice(-36)} up={up} height={56} neon strokeWidth={1.6} /></div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between px-5 py-3 text-xs text-white/50">
                  <span>Se recalcula cada 15 min · en la demo cada 30 s</span>
                  <span className="flex items-center gap-1 text-white/70 transition-colors group-hover:text-neon">Abrir <ArrowRight size={13} /></span>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ---------- La carta, con fotos reales ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Cada plato y cada trago, con su precio del momento.</h2>
            <p className="mt-4 max-w-md text-ink/75">
              El cliente escanea el QR de su mesa, ve la cotización y paga el precio que vio al agregarlo. Si un insumo se termina, el producto aparece agotado en la carta, en la tablet del mozo y en la caja a la vez.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {s.productos.filter((p) => p.activo).slice(0, 12).map((p, i) => (
              <Link key={p.id} href="/menu/bar-central/12" className={cx("group relative block overflow-hidden rounded-2xl", i > 5 && "hidden sm:block")}>
                <ProductIcon icono={p.icono} size="full" alt={p.nombre} className="!rounded-2xl transition-transform duration-300 ease-out group-hover:scale-[1.03]" />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-6 font-mono text-[11px] font-semibold text-white">{money(p.precio_actual)}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Comparativa ---------- */}
      <section className="border-y border-line bg-panel/40">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:py-24">
          <div className="relative overflow-hidden rounded-3xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${ASSET_BASE}fotos/bar-salon.jpg`} alt="Salón de un bar con mesas listas para el servicio" className="h-full min-h-72 w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
            <div className="absolute bottom-0 p-6">
              <p className="max-w-xs text-2xl font-bold leading-tight text-white">Lo que hoy resolvés con cinco herramientas, en una.</p>
            </div>
          </div>
          <div>
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Hecho para superar al POS de siempre</h2>
            <div className="mt-8 overflow-hidden rounded-2xl border border-line">
              <table className="w-full text-sm">
                <thead className="bg-card"><tr className="text-left"><th className="px-4 py-3 font-semibold text-up">Nexoresto</th><th className="px-4 py-3 font-medium text-mute">POS tradicional</th></tr></thead>
                <tbody>
                  {COMPARATIVA.map(([nexo, trad]) => (
                    <tr key={nexo} className="border-t border-line">
                      <td className="px-4 py-3"><span className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-up" />{nexo}</span></td>
                      <td className="px-4 py-3 text-mute"><span className="flex gap-2.5"><Minus size={16} className="mt-0.5 shrink-0" />{trad}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Acceso por rol ---------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Cada rol, su pantalla</h2>
          <p className="max-w-md text-sm text-mute">Abrí varias en pestañas distintas: un pedido del salón aparece al instante en cocina, en la caja y en la TV. Cada pestaña tiene su propio PIN.</p>
        </div>
        <div className="mt-10 grid gap-x-10 gap-y-10 md:grid-cols-2">
          {ROLES.map((g) => (
            <div key={g.grupo}>
              <h3 className="mb-2 text-sm font-semibold text-mute">{g.grupo}</h3>
              <ul className="divide-y divide-line border-y border-line">
                {g.items.map((m) => (
                  <li key={m.href}>
                    <Link href={m.href} className="group flex items-center gap-4 py-3.5 transition-colors hover:bg-raised/40">
                      <m.icon size={20} className="shrink-0 text-up" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{m.t}</span>
                        <span className="block truncate text-sm text-mute">{m.d}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-dim">{m.pin ? `PIN ${m.pin}` : "público"}</span>
                      <ArrowRight size={16} className="shrink-0 text-dim transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-up" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-dim sm:px-6">
          <span><Logo size="text-xs" /> · Tu bar, en modo futuro.</span>
          <span>Fotografías: Unsplash (licencia Unsplash) · Next.js · Supabase · Claude</span>
        </div>
      </footer>
    </main>
  );
}
