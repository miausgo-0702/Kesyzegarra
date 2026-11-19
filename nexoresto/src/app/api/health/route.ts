import { NextResponse } from "next/server";

/** Informa QUÉ integraciones están configuradas (nunca devuelve valores). */
export async function GET() {
  return NextResponse.json({
    supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service_role: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    cron: !!process.env.CRON_SECRET,
  });
}
