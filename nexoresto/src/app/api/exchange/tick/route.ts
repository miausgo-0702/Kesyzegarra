// Motor Exchange programado (Vercel Cron cada 15 min, ver vercel.json).
// Alternativa equivalente dentro de Supabase: pg_cron + exchange_tick() (migración 0001).
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const sb = supabaseAdmin();
  if (!sb) return NextResponse.json({ ok: true, modo: "demo", nota: "Sin Supabase: el motor corre en el navegador (modo demo)." });

  const { data: bares, error } = await sb.from("bares").select("id, slug").neq("estado_licencia", "suspendida");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const resultados = [];
  for (const b of bares ?? []) {
    const r = await sb.rpc("exchange_tick", { p_bar: b.id });
    resultados.push({ bar: b.slug, cambios: r.data ?? 0, error: r.error?.message });
    if (r.error) await sb.from("logs_sistema").insert({ bar_id: b.id, nivel: "error", origen: "exchange", mensaje: r.error.message });
  }
  return NextResponse.json({ ok: true, resultados });
}
