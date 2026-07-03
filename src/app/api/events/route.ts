// POST /api/events — ingesta de eventos de analítica del cliente (Fase 6).
//
// Recibe lotes (máx 20) enviados por src/lib/analytics.ts vía sendBeacon o
// fetch keepalive, los valida con Zod y los inserta en analytics_events.
//
// PRIVACIDAD (regla dura): JAMÁS se persiste la IP ni el user-agent completo;
// del UA solo se deriva una clasificación gruesa de dispositivo.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { analyticsEvents } from "@/db/schema/analytics";
import { getSessionUser } from "@/lib/session";
import { permitirIntento } from "@/lib/rate-limit";

const COOKIE_SESION = "agora_sid";
const MAX_EVENTOS = 20;
const MAX_METADATA_BYTES = 1024; // metadata serializada < 1KB por evento

// Solo rutas INTERNAS: deben empezar con "/" (nunca URLs externas completas).
const rutaInternaSchema = z.string().max(200).regex(/^\//, "Debe ser ruta interna");

// SOLO los 4 tipos que el cliente puede emitir. Los eventos de negocio
// (add_carrito, orden_creada, pago_verificado) se emiten SERVER-SIDE en otro
// módulo: si llegan desde el browser se rechazan (un cliente no puede
// "declararse" una venta verificada).
const eventoSchema = z
  .object({
    tipo: z.enum(["busqueda", "vista_tienda", "vista_producto", "click_producto"]),
    vendorId: z.string().uuid().optional(),
    productId: z.string().uuid().optional(),
    query: z.string().max(120).optional(),
    ruta: rutaInternaSchema,
    referrerInterno: rutaInternaSchema.nullish(),
    // Objeto plano; el tamaño serializado se acota abajo con superRefine.
    metadata: z.record(z.unknown()).optional(),
    ts: z.number().optional(), // timestamp del cliente: se acepta pero no se persiste
  })
  .superRefine((evento, ctx) => {
    if (evento.metadata === undefined) return;
    try {
      if (JSON.stringify(evento.metadata).length >= MAX_METADATA_BYTES) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["metadata"],
          message: "metadata demasiado grande",
        });
      }
    } catch {
      // Metadata no serializable (ciclos, BigInt…): inválida.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["metadata"],
        message: "metadata no serializable",
      });
    }
  });

const loteSchema = z.array(eventoSchema).min(1).max(MAX_EVENTOS);

/**
 * Clasificación GRUESA del dispositivo a partir del user-agent.
 * Se comprueba tablet ANTES que mobile porque el UA de iPad/Safari puede
 * contener también "Mobile". El UA completo NO se guarda en ningún sitio.
 */
function clasificarDevice(ua: string | null): "mobile" | "tablet" | "desktop" | "desconocido" {
  if (!ua) return "desconocido";
  if (/tablet|ipad/i.test(ua)) return "tablet";
  if (/mobile/i.test(ua)) return "mobile";
  return "desktop";
}

export async function POST(req: NextRequest) {
  try {
    // Rate limit ANTI-FLOOD: 30 lotes / min por sessionId (o IP si aún no hay
    // cookie). Con el flush normal del cliente (lotes de hasta 20 eventos)
    // nadie legítimo se acerca; protege la ingesta ANTES de parsear el body.
    // La IP se lee solo para diferenciar clientes — jamás se persiste.
    const sidCookie = req.cookies.get(COOKIE_SESION)?.value ?? "";
    const ipCliente =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    if (!permitirIntento(`events:${sidCookie || ipCliente}`, 30, 60_000)) {
      return NextResponse.json({ error: "Demasiadas peticiones." }, { status: 429 });
    }

    // sendBeacon con Blob llega como application/json, pero algunos browsers
    // degradan a text/plain: leemos texto crudo y parseamos JSON a mano en
    // vez de fiarnos del content-type.
    let lote: z.infer<typeof loteSchema>;
    try {
      const parseado = loteSchema.safeParse(JSON.parse(await req.text()));
      if (!parseado.success) {
        return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
      }
      lote = parseado.data;
    } catch {
      return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
    }

    // sessionId anónimo: cookie "agora_sid"; si no existe se genera y se
    // devuelve en la respuesta (por eso, en ese caso, 200 con Set-Cookie).
    const cookieExistente = req.cookies.get(COOKIE_SESION)?.value;
    const sessionId =
      cookieExistente && cookieExistente.length <= 64
        ? cookieExistente
        : crypto.randomUUID();
    const cookieNueva = sessionId !== cookieExistente;

    // Usuario autenticado si lo hay; un fallo de auth no tumba la ingesta.
    let userId: string | null = null;
    try {
      userId = (await getSessionUser())?.id ?? null;
    } catch {
      userId = null;
    }

    const device = clasificarDevice(req.headers.get("user-agent"));

    // INSERT evento por evento con try individual: vendorId/productId son FKs
    // (23503 si el id no existe). Validar existencia con SELECTs previos o
    // reintentar el lote anulando ids inválidos sería más caro/complejo que
    // este loop de máximo 20 filas; un id inventado solo descarta SU evento,
    // no el lote entero. La analítica es best-effort: fila que falla, fila
    // que se pierde en silencio.
    for (const evento of lote) {
      try {
        await db.insert(analyticsEvents).values({
          eventType: evento.tipo,
          userId,
          sessionId,
          vendorId: evento.vendorId ?? null,
          productId: evento.productId ?? null,
          orderId: null, // orderId solo lo ponen los eventos server-side
          ruta: evento.ruta,
          referrerInterno: evento.referrerInterno ?? null,
          query: evento.tipo === "busqueda" ? (evento.query ?? null) : null,
          device,
          metadata: evento.metadata ?? {},
        });
      } catch {
        // FK inexistente u otro fallo puntual: se descarta solo este evento.
      }
    }

    // 204 sin body en el caso común; 200 {ok} cuando hay que setear la cookie.
    if (!cookieNueva) return new NextResponse(null, { status: 204 });

    const res = NextResponse.json({ ok: true }, { status: 200 });
    res.cookies.set(COOKIE_SESION, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 días
      path: "/",
    });
    return res;
  } catch {
    // Jamás filtrar detalles internos en la respuesta.
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}

// Fin del endpoint de ingesta de analítica.
