"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/ui/kit";
import { PinPad } from "@/components/ui/PinPad";
import { inicioDeRol } from "@/components/ui/Shell";
import { useNexo, useNow, useSesion } from "@/lib/store/NexoProvider";
import { hhmm } from "@/lib/format";
import { ASSET_BASE } from "@/components/icons/ProductIcon";

/** Pantalla de ingreso: PIN de 4 dígitos y directo a la pantalla de cada rol. */
export default function Login() {
  const sesion = useSesion();
  const router = useRouter();
  const slug = useNexo((s) => s.bar.slug);
  const now = useNow(30_000);
  useEffect(() => {
    if (sesion) router.replace(inicioDeRol(sesion.rol).replace("bar-central", slug));
  }, [sesion, router, slug]);
  return (
    <div className="relative isolate grid min-h-dvh place-items-center overflow-hidden p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${ASSET_BASE}fotos/bar-barra.jpg`} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-25" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(5,7,10,.7),#05070a_75%)]" />
      <div className="w-full max-w-sm animate-[popIn_.4s_cubic-bezier(0.23,1,0.32,1)_both]">
        <div className="mb-6 flex items-center justify-between px-1">
          <Logo size="text-2xl" />
          <span className="font-mono text-sm tabular-nums text-mute">{hhmm(now)}</span>
        </div>
        <PinPad />
      </div>
    </div>
  );
}
