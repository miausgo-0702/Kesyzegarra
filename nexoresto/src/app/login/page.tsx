"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Logo } from "@/components/ui/kit";
import { PinPad } from "@/components/ui/PinPad";
import { NAV, puede } from "@/components/ui/Shell";
import { useSesion } from "@/lib/store/NexoProvider";

export default function Login() {
  const sesion = useSesion();
  const router = useRouter();
  useEffect(() => {
    if (!sesion) return;
    const destino = NAV.find((n) => puede(sesion.rol, n.roles) && n.roles.includes(sesion.rol))?.href
      ?? (sesion.rol === "jefe" ? "/admin/dashboard" : sesion.rol === "super_admin" ? "/superadmin" : sesion.rol === "pantalla_tv" ? "/tv/bar-central" : "/");
    router.replace(destino);
  }, [sesion, router]);
  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 block text-center"><Logo size="text-2xl" /></Link>
        <PinPad />
      </div>
    </div>
  );
}
