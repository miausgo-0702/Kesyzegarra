import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con service_role SOLO para el servidor (cron del Exchange, login por PIN,
 * copiloto IA). Nunca importar desde componentes de cliente.
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
