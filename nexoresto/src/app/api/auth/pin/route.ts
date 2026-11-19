// Login rápido por PIN de 4 dígitos (producción con Supabase).
//  1. El dispositivo está vinculado a un bar (NEXT_PUBLIC_DEFAULT_BAR_SLUG o body.bar).
//  2. verificar_pin() compara el hash bcrypt en Postgres (con bloqueo y auditoría).
//  3. Se genera un magic link del usuario y se canjea en el servidor → cookie de sesión.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

const Body = z.object({ pin: z.string().regex(/^\d{4}$/), bar: z.string().min(3).max(40).optional() });

// Limitador simple en memoria por IP (además del bloqueo por usuario en SQL)
const intentos = new Map<string, { n: number; hasta: number }>();

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "PIN inválido" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const st = intentos.get(ip);
  if (st && st.n >= 8 && st.hasta > Date.now()) return NextResponse.json({ error: "Demasiados intentos" }, { status: 429 });

  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase no configurado" }, { status: 503 });
  const slug = parsed.data.bar ?? process.env.NEXT_PUBLIC_DEFAULT_BAR_SLUG ?? "bar-central";
  const { data: bar } = await admin.from("bares").select("id").eq("slug", slug).single();
  if (!bar) return NextResponse.json({ error: "Bar no encontrado" }, { status: 404 });

  const { data, error } = await admin.rpc("verificar_pin", { p_bar: bar.id, p_pin: parsed.data.pin });
  const u = Array.isArray(data) ? data[0] : null;
  if (error || !u) {
    intentos.set(ip, { n: (st?.n ?? 0) + 1, hasta: Date.now() + 5 * 60_000 });
    return NextResponse.json({ error: "PIN incorrecto" }, { status: 401 });
  }
  intentos.delete(ip);

  // Sesión real de Supabase Auth para que RLS aplique a este usuario
  const { data: usr } = await admin.auth.admin.getUserById(u.usuario_id);
  const email = usr.user?.email;
  if (!email) return NextResponse.json({ error: "Usuario sin email en Auth" }, { status: 500 });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr || !link.properties?.hashed_token) return NextResponse.json({ error: "No se pudo iniciar sesión" }, { status: 500 });

  const store = await cookies();
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => store.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => store.set(name, value, options)) },
  });
  const { error: otpErr } = await sb.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (otpErr) return NextResponse.json({ error: "No se pudo iniciar sesión" }, { status: 500 });

  return NextResponse.json({ id: u.usuario_id, nombre: u.nombre, rol: u.rol, bar_id: bar.id });
}
