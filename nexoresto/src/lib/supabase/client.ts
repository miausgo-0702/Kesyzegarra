import { createBrowserClient } from "@supabase/ssr";

let cliente: ReturnType<typeof createBrowserClient> | null = null;

/** Cliente de Supabase para el navegador (sesión en cookies, Realtime incluido). */
export function supabaseBrowser() {
  if (!cliente) {
    cliente = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  }
  return cliente;
}
