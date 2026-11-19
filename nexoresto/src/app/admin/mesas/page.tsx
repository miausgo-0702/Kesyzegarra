"use client";
// Salón del bar: sectores, mesas (número y capacidad) y los QR de cada mesa para imprimir.
import { useState } from "react";
import { Pencil, Plus, Printer, QrCode, Trash2, Users } from "lucide-react";
import { Shell } from "@/components/ui/Shell";
import { Badge, Btn, Field, Modal, Panel, Segmented, inputCls, toast } from "@/components/ui/kit";
import { QR } from "@/components/ui/QR";
import { useDispatch, useNexo } from "@/lib/store/NexoProvider";
import { cx } from "@/lib/format";

export default function Mesas() {
  return <Shell roles={[]} titulo="Mesas y QR"><Editor /></Shell>;
}

function Editor() {
  const s = useNexo();
  const dispatch = useDispatch();
  const [vista, setVista] = useState<"mesas" | "qr">("mesas");
  const [mesa, setMesa] = useState<{ id?: string; numero: number; capacidad: number; sector_id: string } | null>(null);
  const [sector, setSector] = useState<{ id?: string; nombre: string } | null>(null);
  const origen = typeof window !== "undefined" ? window.location.origin : "";
  const urlMesa = (n: number) => `${origen}/menu/${s.bar.slug}/${n}`;
  const proximoNumero = Math.max(0, ...s.mesas.map((m) => m.numero)) + 1;

  async function guardarMesa() {
    if (!mesa) return;
    const e = await dispatch({ type: "guardarMesa", mesa });
    if (e) return toast(e, "down");
    toast(mesa.id ? `Mesa ${mesa.numero} actualizada` : `Mesa ${mesa.numero} agregada`);
    setMesa(null);
  }
  async function guardarSector() {
    if (!sector) return;
    const e = await dispatch({ type: "guardarSector", sector });
    if (e) return toast(e, "down");
    setSector(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={vista} onChange={setVista} options={[{ value: "mesas", label: "Mesas" }, { value: "qr", label: "QR para imprimir" }]} />
        <span className="flex-1" />
        {vista === "mesas" ? (
          <>
            <Btn onClick={() => setSector({ nombre: "" })}><Plus size={15} />Sector</Btn>
            <Btn variant="primary" onClick={() => setMesa({ numero: proximoNumero, capacidad: 4, sector_id: s.sectores[0]?.id ?? "" })} disabled={!s.sectores.length}><Plus size={15} />Mesa</Btn>
          </>
        ) : <Btn variant="primary" onClick={() => window.print()}><Printer size={15} />Imprimir</Btn>}
      </div>

      {vista === "mesas" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {s.sectores.map((sec) => {
            const ms = s.mesas.filter((m) => m.sector_id === sec.id).sort((a, b) => a.numero - b.numero);
            return (
              <Panel key={sec.id}>
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{sec.nombre}</h2>
                  <Badge tono="mute">{ms.length} mesas · {ms.reduce((a, m) => a + m.capacidad, 0)} lugares</Badge>
                  <span className="flex-1" />
                  <button onClick={() => setSector({ id: sec.id, nombre: sec.nombre })} className="press grid h-8 w-8 place-items-center rounded-lg text-mute hover:bg-raised hover:text-ink" aria-label="Renombrar sector"><Pencil size={14} /></button>
                  <button onClick={async () => { const e = await dispatch({ type: "borrarSector", id: sec.id }); if (e) toast(e, "warn"); }} className="press grid h-8 w-8 place-items-center rounded-lg text-mute hover:bg-raised hover:text-down" aria-label="Borrar sector"><Trash2 size={14} /></button>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {ms.map((m) => (
                    <button key={m.id} onClick={() => setMesa({ id: m.id, numero: m.numero, capacidad: m.capacidad, sector_id: m.sector_id })}
                      className="press flex aspect-square flex-col items-center justify-center rounded-2xl border border-line bg-bg/60 hover:border-up/50">
                      <span className="font-mono text-2xl font-bold">{m.numero}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-mute"><Users size={11} />{m.capacidad}</span>
                    </button>
                  ))}
                  <button onClick={() => setMesa({ numero: proximoNumero, capacidad: 4, sector_id: sec.id })} className="press flex aspect-square flex-col items-center justify-center rounded-2xl border border-dashed border-line text-mute hover:border-up/50 hover:text-up" aria-label={`Agregar mesa en ${sec.nombre}`}>
                    <Plus size={20} />
                  </button>
                </div>
              </Panel>
            );
          })}
        </div>
      ) : (
        <div id="hoja-qr" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
          {[...s.mesas].sort((a, b) => a.numero - b.numero).map((m) => (
            <div key={m.id} className="flex break-inside-avoid flex-col items-center rounded-2xl border border-line bg-white p-4 text-center text-black">
              <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{s.bar.nombre}</div>
              <QR value={urlMesa(m.numero)} size={150} className="my-2" />
              <div className="text-2xl font-extrabold">Mesa {m.numero}</div>
              <div className="mt-1 flex items-center gap-1 text-xs text-neutral-600"><QrCode size={12} />Escaneá para pedir, ver precios y votar</div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!mesa} onClose={() => setMesa(null)} title={mesa?.id ? `Mesa ${mesa.numero}` : "Nueva mesa"}
        footer={<div className="flex justify-between gap-2">
          {mesa?.id ? <Btn variant="ghost" onClick={async () => { const e = await dispatch({ type: "borrarMesa", id: mesa.id! }); if (e) return toast(e, "warn"); setMesa(null); toast("Mesa borrada"); }}><Trash2 size={14} />Borrar</Btn> : <span />}
          <span className="flex gap-2"><Btn onClick={() => setMesa(null)}>Cancelar</Btn><Btn variant="primary" onClick={guardarMesa}>Guardar</Btn></span>
        </div>}>
        {mesa && (
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Número"><input id="mesa-numero" type="number" min={1} value={mesa.numero} onChange={(e) => setMesa({ ...mesa, numero: Number(e.target.value) })} className={cx(inputCls, "font-mono")} /></Field>
                <Field label="Lugares"><input id="mesa-capacidad" type="number" min={1} max={30} value={mesa.capacidad} onChange={(e) => setMesa({ ...mesa, capacidad: Number(e.target.value) })} className={cx(inputCls, "font-mono")} /></Field>
              </div>
              <Field label="Sector"><select id="mesa-sector" value={mesa.sector_id} onChange={(e) => setMesa({ ...mesa, sector_id: e.target.value })} className={inputCls}>{s.sectores.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
            </div>
            {mesa.id && <div className="flex flex-col items-center gap-1 rounded-xl bg-white p-3"><QR value={urlMesa(mesa.numero)} size={120} /><span className="text-xs font-semibold text-black">QR de la mesa</span></div>}
          </div>
        )}
      </Modal>

      <Modal open={!!sector} onClose={() => setSector(null)} title={sector?.id ? "Renombrar sector" : "Nuevo sector"}
        footer={<div className="flex justify-end gap-2"><Btn onClick={() => setSector(null)}>Cancelar</Btn><Btn variant="primary" onClick={guardarSector}>Guardar</Btn></div>}>
        {sector && <Field label="Nombre"><input id="sector-nombre" autoFocus value={sector.nombre} onChange={(e) => setSector({ ...sector, nombre: e.target.value })} onKeyDown={(e) => e.key === "Enter" && guardarSector()} className={inputCls} placeholder="Ej: Patio, Planta alta, Barra" /></Field>}
      </Modal>
    </div>
  );
}
