// =============================================================================
//  FASE 7.3 · Copiloto conversacional para Jefes y CM (Claude API + tool use)
//  POST { messages: [{role, content}], snapshot? }
//   · Producción (Supabase): valida la sesión, exige rol jefe/cm y arma el
//     snapshot con el cliente del usuario (RLS aplica: solo su bar).
//   · Modo demo: usa el snapshot enviado por el navegador (datos de prueba).
//  Las herramientas son de SOLO LECTURA; las acciones vuelven como propuestas.
// =============================================================================
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { TOOL_DEFS, ejecutarHerramienta, respuestaLocal, type Grafico, type Propuesta, type Snapshot } from "@/lib/ai/copilotTools";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODELO = process.env.NEXORESTO_AI_MODEL || "claude-opus-5-5";
const MAX_VUELTAS = 6;

const SISTEMA = `Sos el Copiloto de Nexoresto, el analista de negocio de un bar/restaurante argentino.
Hablás en español rioplatense, claro y directo, como un gerente con experiencia. Respondé en 2 a 6 oraciones,
con números concretos (precios con $ y punto de miles, márgenes en %), y una recomendación accionable cuando aplique.

Reglas:
- Usá SIEMPRE las herramientas para obtener datos; nunca inventes cifras. Si un dato no existe, decilo.
- "Ganancia" = ventas − costo de receta (escandallo). Considerá el piso del motor Exchange (costo × 1,35) al proponer descuentos.
- Si una comparación se entiende mejor visualmente, llamá a "graficar" (máx. 12 puntos).
- Para acciones (Market Crash, promo, compra) usá "proponer_accion": el usuario confirma con un botón. No digas que ya se ejecutó.
- Usá negritas de Markdown solo para el dato clave.`;

interface Body { messages: { role: "user" | "assistant"; content: string }[]; snapshot?: Snapshot }

async function snapshotSupabase(): Promise<Snapshot | NextResponse> {
  const store = await cookies();
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => store.getAll(), setAll: () => {} },
  });
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  const { data: perfil } = await sb.from("perfiles_usuarios").select("bar_id, rol").eq("id", auth.user.id).single();
  if (!perfil || !["jefe", "cm", "super_admin"].includes(perfil.rol)) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const bar = perfil.bar_id;
  const desde = new Date(Date.now() - 56 * 86400_000).toISOString();
  const q = (t: string, cols = "*") => sb.from(t).select(cols).eq("bar_id", bar);
  const [b, productos, categorias, insumos, recetas, pedidos, items, usuarios] = await Promise.all([
    sb.from("bares").select("*").eq("id", bar).single(),
    q("productos"), q("categorias"), q("insumos", "*, proveedores(nombre)"), q("recetas"),
    q("pedidos").gte("created_at", desde), q("pedido_items").gte("creado_at", desde), q("perfiles_usuarios", "id, nombre, rol"),
  ]);
  const n = (v: unknown) => Number(v ?? 0);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return {
    bar: b.data as any,
    productos: ((productos.data ?? []) as any[]).map((p) => ({ ...p, precio_actual: n(p.precio_actual), precio_base: n(p.precio_base), precio_minimo: n(p.precio_minimo), precio_maximo: n(p.precio_maximo), variacion_porcentaje: n(p.variacion_porcentaje) })),
    categorias: (categorias.data ?? []) as any,
    insumos: ((insumos.data ?? []) as any[]).map((i) => ({ ...i, stock_actual: n(i.stock_actual), stock_minimo: n(i.stock_minimo), costo_unitario: n(i.costo_unitario), proveedor: i.proveedores?.nombre ?? "—" })),
    recetas: ((recetas.data ?? []) as any[]).map((r) => ({ ...r, cantidad: n(r.cantidad) })),
    pedidos: ((pedidos.data ?? []) as any[]).map((p) => ({ ...p, subtotal: n(p.subtotal), descuento: n(p.descuento), total: n(p.total), pagado: n(p.pagado), propina: n(p.propina) })),
    items: ((items.data ?? []) as any[]).map((i) => ({ ...i, precio_unitario: n(i.precio_unitario), costo_unitario: n(i.costo_unitario) })),
    usuarios: (usuarios.data ?? []) as any, mermas: [], turnos: [], movimientos: [], crash: null, promociones: [], fotos: [],
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export async function POST(req: Request) {
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const mensajes = (body.messages ?? []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()).slice(-12);
  if (!mensajes.length || mensajes[mensajes.length - 1].role !== "user") return NextResponse.json({ error: "Falta la pregunta" }, { status: 400 });

  let snapshot: Snapshot | undefined;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const r = await snapshotSupabase();
    if (r instanceof NextResponse) return r;
    snapshot = r;
  } else {
    snapshot = body.snapshot; // modo demo: datos de prueba del navegador
  }
  if (!snapshot?.productos) return NextResponse.json({ error: "Sin datos del bar" }, { status: 400 });

  const pregunta = mensajes[mensajes.length - 1].content.slice(0, 2000);
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ ...respuestaLocal(snapshot, pregunta), modo: "local" });

  const client = new Anthropic();
  const salida = { graficos: [] as Grafico[], propuestas: [] as Propuesta[] };
  const tools = TOOL_DEFS.map((t) => ({ ...t, input_schema: t.input_schema as unknown as Anthropic.Beta.Messages.BetaTool.InputSchema })) as Anthropic.Beta.Messages.BetaTool[];
  const historial: Anthropic.Beta.Messages.BetaMessageParam[] = mensajes.map((m) => ({ role: m.role, content: m.content }));
  const contexto = `Bar: ${snapshot.bar?.nombre ?? "—"}. Fecha y hora actual: ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}.`;

  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const resp = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        system: [{ type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } }, { type: "text", text: contexto }],
        tools,
        messages: historial,
        output_config: { effort: "medium" },
        // Si el modelo declina por política, la API reintenta en un modelo de respaldo en la misma llamada
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });

      if (resp.stop_reason === "refusal") {
        return NextResponse.json({ texto: "No puedo ayudarte con esa consulta. Probá reformularla sobre ventas, stock, tiempos o promos del bar.", ...salida, modo: "claude" });
      }
      if (resp.stop_reason === "pause_turn") { historial.push({ role: "assistant", content: resp.content }); continue; }

      const usos = resp.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
      if (resp.stop_reason !== "tool_use" || !usos.length) {
        const texto = resp.content.filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
        return NextResponse.json({ texto: texto || "Listo.", ...salida, modo: "claude" });
      }

      historial.push({ role: "assistant", content: resp.content });
      const resultados: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = usos.map((u) => {
        try {
          const r = ejecutarHerramienta(snapshot!, u.name, (u.input ?? {}) as Record<string, unknown>, salida);
          return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(r).slice(0, 12000) };
        } catch (e) {
          return { type: "tool_result", tool_use_id: u.id, content: `Error: ${e instanceof Error ? e.message : String(e)}`, is_error: true };
        }
      });
      historial.push({ role: "user", content: resultados });
    }
    return NextResponse.json({ texto: "La consulta necesitó demasiados pasos. Probá hacerla más específica.", ...salida, modo: "claude" });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "El copiloto está muy solicitado, probá en unos segundos." }, { status: 429 });
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ ...respuestaLocal(snapshot, pregunta), modo: "local", aviso: "ANTHROPIC_API_KEY inválida: respuesta local" });
    if (e instanceof Anthropic.APIError) return NextResponse.json({ error: `Error del proveedor de IA (${e.status ?? "?"})` }, { status: 502 });
    return NextResponse.json({ error: "No pude conectar con el copiloto" }, { status: 500 });
  }
}
