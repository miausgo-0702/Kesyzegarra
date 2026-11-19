"use client";
// Equipo del bar: personas, rol y PIN de 4 dígitos para entrar en los dispositivos.
import { useState } from "react";
import { Eye, EyeOff, Plus, UserRound } from "lucide-react";
import { Shell, ROL_LABEL } from "@/components/ui/Shell";
import { Badge, Btn, Field, Modal, Panel, inputCls, toast } from "@/components/ui/kit";
import { useDispatch, useNexo } from "@/lib/store/NexoProvider";
import { cx } from "@/lib/format";
import type { Rol } from "@/lib/types";

const ROLES_BAR: Rol[] = ["jefe", "caja", "mozo", "cocina", "bartender", "cm", "cadete", "pantalla_tv"];
const QUE_VE: Record<Rol, string> = {
  super_admin: "Todo el sistema", jefe: "Todas las pantallas del bar, reportes y configuración", caja: "Caja, salón, reservas y delivery",
  mozo: "Salón y reservas", cocina: "Pantalla de cocina", bartender: "Pantalla de barra", cm: "Market Crash, fotos, eventos y promos",
  cadete: "Sus viajes de delivery", pantalla_tv: "La pantalla del salón",
};

export default function Equipo() {
  return <Shell roles={[]} titulo="Equipo"><Lista /></Shell>;
}

function Lista() {
  const s = useNexo();
  const dispatch = useDispatch();
  const [edit, setEdit] = useState<{ id?: string; nombre: string; rol: Rol; pin: string; activo: boolean } | null>(null);
  const [verPins, setVerPins] = useState(false);
  const equipo = s.usuarios.filter((u) => u.rol !== "super_admin").sort((a, b) => Number(b.activo) - Number(a.activo) || ROLES_BAR.indexOf(a.rol) - ROLES_BAR.indexOf(b.rol));

  async function guardar() {
    if (!edit) return;
    const e = await dispatch({ type: "guardarUsuario", usuario: edit });
    if (e) return toast(e, "down");
    toast(edit.id ? `${edit.nombre} actualizado` : `${edit.nombre} se sumó al equipo`);
    setEdit(null);
  }
  const pinLibre = () => { let p = ""; do { p = String(1000 + Math.floor(Math.random() * 9000)); } while (s.usuarios.some((u) => u.pin === p)); return p; };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-mute">{equipo.filter((u) => u.activo).length} personas activas</p>
        <Btn onClick={() => setVerPins((v) => !v)}>{verPins ? <EyeOff size={15} /> : <Eye size={15} />}{verPins ? "Ocultar PINs" : "Mostrar PINs"}</Btn>
        <Btn variant="primary" onClick={() => setEdit({ nombre: "", rol: "mozo", pin: pinLibre(), activo: true })}><Plus size={15} />Agregar persona</Btn>
      </div>
      <Panel pad={false}>
        <ul className="divide-y divide-line">
          {equipo.map((u) => (
            <li key={u.id}>
              <button onClick={() => setEdit({ id: u.id, nombre: u.nombre, rol: u.rol, pin: u.pin, activo: u.activo })} className={cx("flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-raised/40", !u.activo && "opacity-50")}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-raised text-sm font-bold">{u.nombre.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{u.nombre}{!u.activo && <span className="ml-2 text-xs font-normal text-mute">inactivo</span>}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tono={u.rol === "jefe" ? "info" : u.rol === "cm" ? "crash" : u.rol === "cocina" || u.rol === "bartender" ? "warn" : "up"}>{ROL_LABEL[u.rol]}</Badge>
                    <span className="hidden truncate text-xs text-mute sm:inline">{QUE_VE[u.rol]}</span>
                  </span>
                </span>
                <span className="shrink-0 rounded-lg bg-raised px-2.5 py-1 font-mono text-sm tracking-widest">{verPins ? u.pin : "••••"}</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? edit.nombre : "Nueva persona"}
        footer={<div className="flex justify-between gap-2">
          {edit?.id ? <Btn variant="ghost" onClick={() => setEdit({ ...edit, activo: !edit.activo })}>{edit.activo ? "Dar de baja" : "Reactivar"}</Btn> : <span />}
          <span className="flex gap-2"><Btn onClick={() => setEdit(null)}>Cancelar</Btn><Btn variant="primary" onClick={guardar}>Guardar</Btn></span>
        </div>}>
        {edit && (
          <div className="space-y-4">
            <Field label="Nombre y apellido"><input id="u-nombre" autoFocus value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} className={inputCls} /></Field>
            <Field label="Rol" grupo>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ROLES_BAR.map((r) => (
                  <button key={r} type="button" onClick={() => setEdit({ ...edit, rol: r })} className={cx("press rounded-xl border px-2 py-2 text-sm", edit.rol === r ? "border-up bg-up/10 text-up" : "border-line text-ink/80")}>{ROL_LABEL[r]}</button>
                ))}
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-mute"><UserRound size={12} />Ve: {QUE_VE[edit.rol]}</p>
            </Field>
            <Field label="PIN de 4 dígitos" grupo>
              <div className="flex gap-2">
                <input id="u-pin" inputMode="numeric" maxLength={4} value={edit.pin} onChange={(e) => setEdit({ ...edit, pin: e.target.value.replace(/\D/g, "").slice(0, 4) })} className={cx(inputCls, "w-32 text-center font-mono text-xl tracking-[0.5em]")} />
                <Btn type="button" onClick={() => setEdit({ ...edit, pin: pinLibre() })}>Generar</Btn>
              </div>
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}
