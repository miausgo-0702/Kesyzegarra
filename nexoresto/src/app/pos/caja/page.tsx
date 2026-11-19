"use client";
// =============================================================================
//  FASE 4.2 · Caja: apertura, cobro multipago con propina, división de cuenta,
//  cupones, y cierre con ARQUEO CIEGO (el cajero cuenta antes de ver lo esperado).
// =============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Banknote, Bike, CalendarDays, CreditCard, Delete, Eye, Lock, Printer, QrCode, Receipt, ShieldCheck, Ticket, Unlock, Wallet, ArrowLeftRight, Zap } from "lucide-react";
import { Shell } from "@/components/ui/Shell";
import { Badge, Btn, Empty, Field, Kpi, Modal, Panel, Segmented, inputCls, toast } from "@/components/ui/kit";
import { useBackend, useDispatch, useNexo, useNow, useSesion } from "@/lib/store/NexoProvider";
import { ComandaEditor } from "@/components/pos/ComandaEditor";
import { nuevoId } from "@/lib/store/backend";
import { cx, hhmm, money } from "@/lib/format";
import { esperadoTurno, importeItem, itemsDe } from "@/lib/store/selectors";
import { sonido } from "@/lib/sound";
import type { MedioPago, NexoState, Pedido } from "@/lib/types";

const MEDIOS: { id: Exclude<MedioPago, "cupon">; label: string; icon: React.ReactNode }[] = [
  { id: "qr", label: "QR / Billetera", icon: <QrCode size={18} /> },
  { id: "efectivo", label: "Efectivo", icon: <Banknote size={18} /> },
  { id: "debito", label: "Tarjeta débito", icon: <CreditCard size={18} /> },
  { id: "credito", label: "Tarjeta crédito", icon: <CreditCard size={18} /> },
  { id: "transferencia", label: "Transferencia", icon: <ArrowLeftRight size={18} /> },
];

interface Cuenta { key: string; titulo: string; sub: string; pedidos: Pedido[]; saldo: number; total: number; urgente: boolean; tipo: "mesa" | "delivery" | "qr" }

function cuentasAbiertas(s: NexoState): Cuenta[] {
  const abiertos = s.pedidos.filter((p) => p.estado !== "cerrado" && p.estado !== "anulado" && p.pagado < p.total - 0.5);
  const porMesa = new Map<string, Pedido[]>();
  const sueltos: Pedido[] = [];
  for (const p of abiertos) { if (p.mesa_id) porMesa.set(p.mesa_id, [...(porMesa.get(p.mesa_id) ?? []), p]); else sueltos.push(p); }
  const out: Cuenta[] = [];
  for (const [mid, peds] of porMesa) {
    const m = s.mesas.find((x) => x.id === mid)!;
    const total = peds.reduce((a, p) => a + p.total, 0), pagado = peds.reduce((a, p) => a + p.pagado, 0);
    out.push({ key: mid, titulo: `Mesa ${String(m.numero).padStart(2, "0")}`, sub: `${s.sectores.find((x) => x.id === m.sector_id)?.nombre} · ${peds.length} pedido${peds.length > 1 ? "s" : ""}`, pedidos: peds, saldo: total - pagado, total, urgente: m.estado === "cuenta_pedida", tipo: "mesa" });
  }
  for (const p of sueltos) out.push({ key: p.id, titulo: p.tipo === "delivery" ? `Delivery #D-${p.numero}` : `Mostrador #${p.numero}`, sub: p.cliente_nombre ?? "—", pedidos: [p], saldo: p.total - p.pagado, total: p.total, urgente: false, tipo: p.tipo === "delivery" ? "delivery" : "qr" });
  return out.sort((a, b) => Number(b.urgente) - Number(a.urgente) || b.saldo - a.saldo);
}

export default function Caja() {
  return (
    <Shell roles={["caja"]} titulo="Caja · adicionista">
      <PanelCaja />
    </Shell>
  );
}

function PanelCaja() {
  const s = useNexo();
  const sesion = useSesion();
  const turno = s.turnos.find((t) => t.estado === "abierto");
  const [vista, setVista] = useState<"cobrar" | "arqueo">("cobrar");
  if (!turno) return <Apertura />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={vista} onChange={setVista} options={[{ value: "cobrar", label: "Cobrar" }, { value: "arqueo", label: "Arqueo y cierre" }]} />
        <Badge tono="up" dot>Turno abierto {hhmm(turno.apertura_at)}</Badge>
        <Badge tono="info">{turno.caja_nombre} · {s.usuarios.find((u) => u.id === turno.cajero_id)?.nombre ?? sesion?.nombre}</Badge>
        <span className="flex-1" />
        <Link href="/pos/reservas"><Btn size="sm" variant="outline"><CalendarDays size={14} />Reservas</Btn></Link>
        <Link href="/pos/delivery"><Btn size="sm" variant="outline"><Bike size={14} />Delivery</Btn></Link>
      </div>
      {vista === "cobrar" ? <Cobro turnoId={turno.id} /> : <Arqueo turnoId={turno.id} />}
    </div>
  );
}

function Apertura() {
  const dispatch = useDispatch();
  const sesion = useSesion();
  const [fondo, setFondo] = useState("20000");
  const [caja, setCaja] = useState("Caja 1");
  return (
    <div className="mx-auto mt-10 max-w-md">
      <Panel>
        <div className="mb-4 flex items-center gap-3"><Unlock className="text-up" /><h2 className="text-xl font-semibold">Apertura de turno</h2></div>
        <Field label="Caja"><select value={caja} onChange={(e) => setCaja(e.target.value)} className={inputCls}><option>Caja 1</option><option>Caja 2</option></select></Field>
        <Field label="Fondo inicial en efectivo" className="mt-3"><input inputMode="numeric" value={fondo} onChange={(e) => setFondo(e.target.value.replace(/\D/g, ""))} className={cx(inputCls, "h-14 font-mono text-2xl")} /></Field>
        <Btn variant="primary" size="lg" className="mt-4 w-full" onClick={async () => {
          const e = await dispatch({ type: "abrirTurno", caja_nombre: caja, fondo_inicial: Number(fondo) || 0, cajero_id: sesion?.usuario_id ?? null });
          if (e) toast(e, "down"); else toast("Turno abierto");
        }}>Abrir turno</Btn>
      </Panel>
    </div>
  );
}

function Cobro({ turnoId }: { turnoId: string }) {
  const s = useNexo();
  const dispatch = useDispatch();
  const sesion = useSesion();
  const cuentas = useMemo(() => cuentasAbiertas(s), [s]);
  const [sel, setSel] = useState<string | null>(null);
  const cuenta = cuentas.find((c) => c.key === sel) ?? cuentas[0] ?? null;
  const [medio, setMedio] = useState<Exclude<MedioPago, "cupon">>("qr");
  const [importe, setImporte] = useState("");
  const [pagos, setPagos] = useState<{ medio: Exclude<MedioPago, "cupon">; monto: number }[]>([]);
  const [partes, setPartes] = useState(1);
  const [propinaPct, setPropinaPct] = useState(10);
  const [cupon, setCupon] = useState("");
  const [itemsSel, setItemsSel] = useState<Set<string> | null>(null);
  const idem = useRef(nuevoId());
  const [ticket, setTicket] = useState<null | { titulo: string; total: number; pagos: typeof pagos; propina: number; idem: string }>(null);
  const [ventaRapida, setVentaRapida] = useState(false);
  const backend = useBackend();
  const modalVenta = (
    <Modal open={ventaRapida} onClose={() => setVentaRapida(false)} wide title="Venta rápida de mostrador">
      <div className="h-[70dvh]">
        <ComandaEditor mesa={null} onEnviado={(key) => {
          const ped = backend.getState()?.pedidos.find((p) => p.idempotency_key === key);
          setVentaRapida(false);
          if (ped) setSel(ped.id);
        }} />
      </div>
    </Modal>
  );
  const botonVenta = <Btn size="sm" variant="primary" onClick={() => setVentaRapida(true)}><Zap size={14} />Venta rápida</Btn>;

  useEffect(() => { setPagos([]); setImporte(""); setPartes(1); setItemsSel(null); setCupon(""); idem.current = nuevoId(); }, [cuenta?.key]);

  if (!cuenta) return <Panel action={botonVenta}><Empty icon={<Receipt size={34} />} title="No hay cuentas abiertas" hint="Las mesas que piden la cuenta aparecen arriba en amarillo. Para vender en el mostrador usá Venta rápida." />{modalVenta}</Panel>;

  const items = cuenta.pedidos.flatMap((p) => itemsDe(s, p.id)).filter((i) => i.estado_cocina !== "anulado");
  const base = itemsSel ? items.filter((i) => itemsSel.has(i.id)).reduce((a, i) => a + importeItem(i), 0) : cuenta.saldo / partes;
  const objetivoSinPropina = Math.round(Math.min(base, cuenta.saldo));
  const propina = Math.round((objetivoSinPropina * propinaPct) / 100);
  const objetivo = objetivoSinPropina + propina;
  const cargado = pagos.reduce((a, p) => a + p.monto, 0);
  const falta = Math.max(objetivo - cargado, 0);
  const vuelto = Math.max(cargado - objetivo, 0);

  const tecla = (k: string) => {
    sonido.tap();
    if (k === "⌫") return setImporte((v) => v.slice(0, -1));
    if (k === "C") return setImporte("");
    setImporte((v) => (v + k).replace(/^0+/, "").slice(0, 9));
  };
  const agregarPago = () => {
    const monto = Number(importe) || falta;
    if (monto <= 0) return;
    setPagos((p) => [...p, { medio, monto }]);
    setImporte("");
  };

  async function cobrar() {
    const lista = pagos.length ? pagos : [{ medio, monto: Number(importe) || objetivo }];
    const total = lista.reduce((a, p) => a + p.monto, 0);
    if (total < objetivo - 0.5) return toast(`Faltan ${money(objetivo - total)}`, "warn");
    // El excedente es vuelto (se descuenta del último pago) y la propina se separa del cobro
    let exced = total - objetivo;
    const netos = [...lista].reverse().map((p) => { const q = Math.min(p.monto, exced); exced -= q; return { ...p, monto: p.monto - q }; }).reverse();
    let restaPropina = propina;
    const cobros = netos.map((p) => { const q = Math.min(p.monto, restaPropina); restaPropina -= q; return { ...p, monto: p.monto - q }; }).filter((p) => p.monto > 0);
    const key = idem.current;
    const err = await dispatch({ type: "registrarPago", pedido_ids: cuenta!.pedidos.map((p) => p.id), turno_id: turnoId, pagos: cobros, propina, idempotency_key: key, cupon: cupon || null, usuario: sesion?.nombre });
    if (err) return toast(err, "down");
    sonido.cobro();
    setTicket({ titulo: cuenta!.titulo, total: objetivo, pagos: lista, propina, idem: key });
    toast(`Cobrado ${money(objetivo)}${vuelto ? ` · vuelto ${money(vuelto)}` : ""}`);
    setPagos([]); setImporte(""); setItemsSel(null); setPartes(1); setCupon("");
    idem.current = nuevoId();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[260px_1fr_420px]">
      {/* cuentas */}
      <Panel title={`Cuentas abiertas · ${cuentas.length}`} action={botonVenta} className="max-h-[78dvh] overflow-y-auto scroll-thin">
        <ul className="flex flex-col gap-1.5">
          {cuentas.map((c) => (
            <li key={c.key}>
              <button onClick={() => setSel(c.key)} className={cx("w-full rounded-xl border p-3 text-left transition", cuenta.key === c.key ? "border-up/50 bg-up/10" : c.urgente ? "border-warn/50 bg-warn/5" : "border-line hover:border-mute")}>
                <div className="flex items-center justify-between"><span className="font-semibold">{c.titulo}</span>{c.urgente && <Badge tono="warn">Cuenta</Badge>}{c.tipo === "delivery" && <Badge tono="violet">Delivery</Badge>}</div>
                <div className="mt-0.5 flex justify-between text-xs text-mute"><span>{c.sub}</span><span className="font-mono text-ink">{money(c.saldo)}</span></div>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      {/* detalle */}
      <Panel className="flex min-h-[60dvh] flex-col" pad={false}>
        <header className="flex items-center gap-3 border-b border-line p-4">
          <h2 className="text-xl font-bold">{cuenta.titulo}</h2>
          {cuenta.urgente && <Badge tono="warn">Pidiendo cuenta</Badge>}
          <span className="text-xs text-mute">{cuenta.sub}</span>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-2 scroll-thin">
          <table className="w-full text-sm">
            <thead><tr className="eyebrow text-left"><th className="py-2">{itemsSel ? "Paga" : ""}</th><th className="py-2">Producto</th><th className="py-2 text-right">Precio</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className={cx("border-t border-line/60", itemsSel && !itemsSel.has(i.id) && "opacity-40")} onClick={() => itemsSel && setItemsSel((x) => { const n = new Set(x); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; })}>
                  <td className="w-6 py-2">{itemsSel && <input type="checkbox" readOnly checked={itemsSel.has(i.id)} className="accent-[#1ee08f]" />}</td>
                  <td className="py-2">{i.nombre} <span className="font-mono text-mute">×{i.cantidad}</span>{i.modificadores.length > 0 && <span className="block text-xs text-mute">{i.modificadores.map((m) => m.nombre).join(" · ")}</span>}</td>
                  <td className="py-2 text-right font-mono">{money(importeItem(i))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-1 border-t border-line p-4 text-sm">
          <div className="flex justify-between text-mute"><span>Total cuenta</span><span className="font-mono">{money(cuenta.total)}</span></div>
          {cuenta.total - cuenta.saldo > 0 && <div className="flex justify-between text-mute"><span>Ya pagado</span><span className="font-mono">−{money(cuenta.total - cuenta.saldo)}</span></div>}
          <div className="flex justify-between text-mute"><span>{itemsSel ? "Ítems seleccionados" : partes > 1 ? `1 de ${partes} partes` : "Saldo"}</span><span className="font-mono">{money(objetivoSinPropina)}</span></div>
          <div className="flex justify-between text-mute"><span>Propina {propinaPct} %</span><span className="font-mono">{money(propina)}</span></div>
          <div className="flex items-end justify-between pt-2"><span className="eyebrow">Total a cobrar</span><span className="font-mono text-4xl font-bold text-up">{money(objetivo)}</span></div>
        </div>
      </Panel>

      {/* cobro */}
      <div className="flex flex-col gap-3">
        <Panel title="Medio de pago">
          <div className="grid grid-cols-2 gap-2">
            {MEDIOS.map((m) => (
              <button key={m.id} onClick={() => setMedio(m.id)} className={cx("flex h-14 items-center justify-center gap-2 rounded-xl border text-sm font-semibold", medio === m.id ? "border-up bg-up/10 text-up" : "border-line hover:border-mute", m.id === "transferencia" && "col-span-2")}>{m.icon}{m.label}</button>
            ))}
          </div>
        </Panel>
        <Panel title="Dividir cuenta">
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4].map((n) => <button key={n} onClick={() => { setPartes(n); setItemsSel(null); }} className={cx("h-11 rounded-xl border font-mono", !itemsSel && partes === n ? "border-up bg-up/10 text-up" : "border-line")}>{n}</button>)}
            <button onClick={() => setItemsSel(itemsSel ? null : new Set())} className={cx("h-11 rounded-xl border text-sm", itemsSel ? "border-up bg-up/10 text-up" : "border-line")}>Ítems</button>
          </div>
          <div className="mt-2 flex justify-between text-xs text-mute"><span>{itemsSel ? "Tocá los ítems que paga esta persona" : `${partes} parte${partes > 1 ? "s" : ""} igual${partes > 1 ? "es" : ""}`}</span><span className="font-mono">{money(objetivoSinPropina)} c/u</span></div>
          <div className="mt-3 flex items-center gap-2 text-xs text-mute">Propina:
            {[0, 10, 15].map((p) => <button key={p} onClick={() => setPropinaPct(p)} className={cx("rounded-lg border px-2.5 py-1 font-mono", propinaPct === p ? "border-up text-up" : "border-line")}>{p}%</button>)}
            <span className="flex-1" />
            <Ticket size={14} /><input value={cupon} onChange={(e) => setCupon(e.target.value.toUpperCase())} placeholder="Cupón" className="h-8 w-28 rounded-lg border border-line bg-bg px-2 font-mono text-xs" />
          </div>
        </Panel>
        <Panel title="Teclado de importe">
          <div className="mb-2 flex items-center justify-between rounded-xl border border-line bg-bg px-3 py-2">
            <span className="text-xs text-mute">{MEDIOS.find((m) => m.id === medio)?.label}</span>
            <span className="font-mono text-2xl">{importe ? money(Number(importe)) : <span className="text-dim">{money(falta)}</span>}</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {["7", "8", "9", "⌫", "4", "5", "6", "C", "1", "2", "3", "00"].map((k) => (
              <button key={k} onClick={() => tecla(k)} className="grid h-12 place-items-center rounded-xl border border-line bg-card font-mono text-lg active:bg-raised">{k === "⌫" ? <Delete size={18} /> : k}</button>
            ))}
            <button onClick={() => tecla("0")} className="col-span-2 h-12 rounded-xl border border-line bg-card font-mono text-lg">0</button>
            <Btn className="col-span-2 h-12" variant="outline" onClick={agregarPago}>+ Agregar pago</Btn>
          </div>
          {pagos.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm">
              {pagos.map((p, i) => <li key={i} className="flex justify-between"><span>{MEDIOS.find((m) => m.id === p.medio)?.label}</span><span className="font-mono">{money(p.monto)} <button onClick={() => setPagos((x) => x.filter((_, j) => j !== i))} className="ml-1 text-down">×</button></span></li>)}
              <li className="flex justify-between border-t border-line pt-1 font-semibold"><span>{falta ? "Falta" : vuelto ? "Vuelto" : "Completo"}</span><span className={cx("font-mono", falta ? "text-warn" : "text-up")}>{money(falta || vuelto)}</span></li>
            </ul>
          )}
        </Panel>
        <div className="grid grid-cols-[1fr_1.4fr] gap-2">
          <Btn size="xl" variant="ghost" className="whitespace-nowrap !px-3 text-base" onClick={() => setTicket({ titulo: `${cuenta.titulo} · PRE-CUENTA`, total: objetivo, pagos: [], propina, idem: "—" })}><Printer size={18} />Pre-cuenta</Btn>
          <Btn size="xl" variant="primary" onClick={cobrar}>COBRAR {money(objetivo)}</Btn>
        </div>
        <div className="flex justify-between font-mono text-[10px] text-dim"><span>Idempotency-Key: {idem.current.slice(0, 13)}…</span><span>Factura A/B electrónica lista</span></div>
      </div>

      {modalVenta}
      <Modal open={!!ticket} onClose={() => setTicket(null)} title="Comprobante">
        {ticket && (
          <div className="mx-auto max-w-xs rounded-lg bg-white p-5 font-mono text-[12px] leading-relaxed text-black">
            <div className="text-center font-bold">{s.bar.nombre.toUpperCase()}</div>
            <div className="text-center text-[10px]">{s.bar.direccion}</div>
            <div className="my-2 border-t border-dashed border-black" />
            <div>{ticket.titulo}</div>
            <div>{new Date().toLocaleString("es-AR")}</div>
            <div className="my-2 border-t border-dashed border-black" />
            {ticket.pagos.map((p, i) => <div key={i} className="flex justify-between"><span>{MEDIOS.find((m) => m.id === p.medio)?.label}</span><span>{money(p.monto)}</span></div>)}
            <div className="flex justify-between"><span>Propina</span><span>{money(ticket.propina)}</span></div>
            <div className="mt-1 flex justify-between text-base font-bold"><span>TOTAL</span><span>{money(ticket.total)}</span></div>
            <div className="my-2 border-t border-dashed border-black" />
            <div className="break-all text-center text-[9px]">Op. {ticket.idem}</div>
            <div className="text-center text-[10px]">¡Gracias por venir!</div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Arqueo ciego: los campos se completan SIN ver lo esperado; recién al confirmar se revela. */
function Arqueo({ turnoId }: { turnoId: string }) {
  const s = useNexo();
  const dispatch = useDispatch();
  const sesion = useSesion();
  useNow(10_000);
  const [declarado, setDeclarado] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<null | { esperado: Record<string, number>; declarado: Record<string, number>; dif: number }>(null);
  const [confirmar, setConfirmar] = useState(false);
  const turno = s.turnos.find((t) => t.id === turnoId);
  const movs = s.movimientos.filter((m) => m.turno_id === turnoId);
  const pendientes = s.pedidos.filter((p) => p.tipo === "salon" && p.estado !== "cerrado" && p.estado !== "anulado");

  async function cerrar() {
    const dec = Object.fromEntries(MEDIOS.map((m) => [m.id, Number(declarado[m.id] || 0)]));
    const esperado = esperadoTurno(s, turnoId);
    const err = await dispatch({ type: "cerrarTurno", turno_id: turnoId, declarado: dec, usuario: sesion?.nombre });
    setConfirmar(false);
    if (err) return toast(err, "down");
    const dif = Object.keys(esperado).reduce((a, k) => a + (dec[k] ?? 0) - esperado[k as keyof typeof esperado], 0);
    setResultado({ esperado, declarado: dec, dif });
  }

  if (resultado) {
    return (
      <Panel className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center gap-3"><Eye className="text-up" /><h2 className="text-xl font-semibold">Resultado del arqueo</h2></div>
        <table className="w-full text-sm">
          <thead><tr className="eyebrow text-left"><th className="py-2">Medio</th><th className="text-right">Esperado</th><th className="text-right">Contado</th><th className="text-right">Diferencia</th></tr></thead>
          <tbody>
            {MEDIOS.map((m) => { const d = (resultado.declarado[m.id] ?? 0) - (resultado.esperado[m.id] ?? 0); return (
              <tr key={m.id} className="border-t border-line"><td className="py-2">{m.label}</td><td className="text-right font-mono">{money(resultado.esperado[m.id] ?? 0)}</td><td className="text-right font-mono">{money(resultado.declarado[m.id] ?? 0)}</td><td className={cx("text-right font-mono", d === 0 ? "text-up" : "text-down")}>{d > 0 ? "+" : ""}{money(d)}</td></tr>
            ); })}
          </tbody>
        </table>
        <div className={cx("mt-4 rounded-xl border p-4 text-center", resultado.dif === 0 ? "border-up/40 bg-up/10 text-up" : "border-down/40 bg-down/10 text-down")}>
          <div className="eyebrow">Diferencia total</div>
          <div className="font-mono text-3xl font-bold">{money(resultado.dif)}</div>
          <div className="mt-1 text-xs text-mute">Quedó registrado en auditoría con usuario y hora.</div>
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Panel>
        <div className="mb-1 flex items-center gap-3"><Lock className="text-warn" /><h2 className="text-xl font-semibold">Cierre de turno · arqueo ciego</h2></div>
        <p className="mb-5 text-sm text-mute">Contá el efectivo físico y los comprobantes de cada medio. El sistema <b className="text-ink">no muestra lo esperado</b> hasta que confirmes: así se evitan ajustes y errores.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {MEDIOS.map((m) => (
            <Field key={m.id} label={m.label + (m.id === "efectivo" ? " (incluye fondo)" : "")}>
              <input inputMode="numeric" value={declarado[m.id] ?? ""} onChange={(e) => setDeclarado((d) => ({ ...d, [m.id]: e.target.value.replace(/\D/g, "") }))} placeholder="$ 0" className={cx(inputCls, "h-14 font-mono text-xl")} />
            </Field>
          ))}
        </div>
        {pendientes.length > 0 && <p className="mt-4 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">Hay {pendientes.length} pedido(s) de salón sin cobrar. No se puede cerrar un turno con mesas abiertas.</p>}
        <Btn variant="warn" size="lg" className="mt-5 w-full" onClick={() => setConfirmar(true)}><ShieldCheck size={18} />Confirmar conteo y cerrar turno</Btn>
      </Panel>
      <div className="flex flex-col gap-3">
        <Kpi label="Fondo inicial" value={money(turno?.fondo_inicial ?? 0)} />
        <Kpi label="Operaciones del turno" value={movs.filter((m) => m.tipo === "cobro").length} delta={`${movs.filter((m) => m.tipo === "propina").length} con propina`} />
        <Panel title="Turnos anteriores">
          <ul className="space-y-2 text-sm">
            {s.turnos.filter((t) => t.estado === "cerrado").slice(0, 4).map((t) => (
              <li key={t.id} className="flex justify-between"><span>{t.caja_nombre} · {hhmm(t.cierre_at!)}</span><span className={cx("font-mono", (t.diferencia_total ?? 0) === 0 ? "text-up" : "text-down")}>{money(t.diferencia_total ?? 0)}</span></li>
            ))}
          </ul>
        </Panel>
        <p className="flex items-start gap-2 text-xs text-mute"><Wallet size={14} className="mt-0.5 shrink-0" />El cajero ve la diferencia solo después de declarar. El dueño ve el detalle en Auditoría.</p>
      </div>
      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="¿Cerrar el turno?" footer={<div className="flex justify-end gap-2"><Btn onClick={() => setConfirmar(false)}>Revisar</Btn><Btn variant="warn" onClick={cerrar}>Sí, cerrar</Btn></div>}>
        <p className="text-sm text-mute">Una vez confirmado, el conteo no se puede modificar. Total declarado: <b className="font-mono text-ink">{money(Object.values(declarado).reduce((a, v) => a + (Number(v) || 0), 0))}</b></p>
      </Modal>
    </div>
  );
}
