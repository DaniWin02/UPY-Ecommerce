// POST /api/orders/[orderId]/comprobante — el comprador sube su comprobante SPEI.
// Flujo: sesión → orden propia → archivo a disco (lib/comprobantes) →
// transición de estado vía registrarComprobante (lib/orders, contrato de Fase 5).
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema/orders";
import { getSessionUser } from "@/lib/session";
import { guardarComprobante } from "@/lib/comprobantes";
import { registrarComprobante } from "@/lib/orders";
import { permitirIntento } from "@/lib/rate-limit";

// Formato decimal simple: "350", "350.5" o "350.50" (MXN, hasta 2 decimales).
const RE_MONTO = /^\d+(\.\d{1,2})?$/;
// Los ids de orden son UUID; validar antes de consultar evita un error de Postgres.
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // En Next.js 15 los params de rutas dinámicas son una Promise.
  const { orderId } = await params;

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  if (!RE_UUID.test(orderId)) {
    return NextResponse.json({ error: "Pedido no válido." }, { status: 403 });
  }

  // Rate limit: 10 subidas / 10 min por usuario. Un comprador legítimo sube
  // 1-2 comprobantes por pedido; esto frena floods de archivos a disco sin
  // estorbar reintentos normales. Se comprueba ANTES de leer el multipart
  // para no pagar el parseo del archivo en peticiones ya bloqueadas.
  if (!permitirIntento(`comprobante:${user.id}`, 10, 10 * 60_000)) {
    return NextResponse.json(
      { error: "Demasiados intentos, espera unos minutos." },
      { status: 429 }
    );
  }

  // multipart/form-data: file (obligatorio) + montoDeclarado (opcional).
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Se esperaba un formulario multipart con el archivo." },
      { status: 422 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Falta el archivo del comprobante." },
      { status: 422 }
    );
  }

  // Monto declarado: opcional; si viene, debe ser un decimal válido.
  const montoRaw = formData.get("montoDeclarado");
  let montoDeclarado: string | null = null;
  if (typeof montoRaw === "string" && montoRaw.trim() !== "") {
    const monto = montoRaw.trim();
    if (!RE_MONTO.test(monto)) {
      return NextResponse.json(
        { error: "El monto declarado no es un número válido (ej. 350.00)." },
        { status: 422 }
      );
    }
    montoDeclarado = monto;
  }

  // La orden debe existir y pertenecer al usuario de la sesión (403 en ambos
  // casos: no revelamos si el pedido de otro comprador existe o no).
  const [orden] = await db
    .select({ id: orders.id, compradorId: orders.compradorId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orden || orden.compradorId !== user.id) {
    return NextResponse.json(
      { error: "No puedes subir comprobantes a este pedido." },
      { status: 403 }
    );
  }

  // 1) Persistir el archivo en disco (valida tamaño y MIME).
  const guardado = await guardarComprobante(orderId, file);
  if (!guardado.ok) {
    return NextResponse.json({ error: guardado.error }, { status: 422 });
  }

  // 2) Registrar en BD y transicionar el estado (contrato de lib/orders).
  const resultado = await registrarComprobante(
    orderId,
    user.id,
    guardado.ruta,
    montoDeclarado ?? undefined
  );
  if (!resultado.ok) {
    // Estado inválido para recibir comprobante (p. ej. ya verificado o expirado).
    return NextResponse.json(
      { error: resultado.error ?? "El pedido no acepta comprobantes en su estado actual." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}

// Fin del endpoint de subida de comprobante.
