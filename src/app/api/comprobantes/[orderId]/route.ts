// GET /api/comprobantes/[orderId] — sirve el comprobante del pedido de forma
// PROTEGIDA: solo el comprador dueño, un miembro del vendor de la orden o el
// superadmin pueden verlo (los archivos NO se sirven como estáticos públicos).
import { NextResponse } from "next/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema/orders";
import { payments } from "@/db/schema/payments";
import { vendorMembers } from "@/db/schema/vendors";
import { getSessionUser } from "@/lib/session";
import { leerComprobante } from "@/lib/comprobantes";

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  // En Next.js 15 los params de rutas dinámicas son una Promise.
  const { orderId } = await params;

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  if (!RE_UUID.test(orderId)) {
    return NextResponse.json({ error: "Comprobante no encontrado." }, { status: 404 });
  }

  // Orden + su pago más reciente CON comprobante (puede haber reintentos).
  const [orden] = await db
    .select({ id: orders.id, compradorId: orders.compradorId, vendorId: orders.vendorId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!orden) {
    return NextResponse.json({ error: "Comprobante no encontrado." }, { status: 404 });
  }

  const [pago] = await db
    .select({ comprobanteUrl: payments.comprobanteUrl })
    .from(payments)
    .where(and(eq(payments.orderId, orderId), isNotNull(payments.comprobanteUrl)))
    .orderBy(desc(payments.createdAt))
    .limit(1);

  if (!pago?.comprobanteUrl) {
    return NextResponse.json({ error: "Comprobante no encontrado." }, { status: 404 });
  }

  // AUTORIZACIÓN: comprador dueño, miembro del vendor de la orden o superadmin.
  let autorizado = orden.compradorId === user.id || user.rolGlobal === "superadmin";
  if (!autorizado) {
    const [miembro] = await db
      .select({ userId: vendorMembers.userId })
      .from(vendorMembers)
      .where(
        and(
          eq(vendorMembers.vendorId, orden.vendorId),
          eq(vendorMembers.userId, user.id)
        )
      )
      .limit(1);
    autorizado = Boolean(miembro);
  }
  if (!autorizado) {
    return NextResponse.json(
      { error: "No tienes acceso a este comprobante." },
      { status: 403 }
    );
  }

  // Lectura segura desde disco (leerComprobante bloquea path traversal).
  const archivo = await leerComprobante(pago.comprobanteUrl);
  if (!archivo) {
    return NextResponse.json({ error: "Comprobante no encontrado." }, { status: 404 });
  }

  return new Response(new Uint8Array(archivo.buffer), {
    headers: {
      "Content-Type": archivo.contentType,
      // Datos financieros personales: nada de caches compartidas ni locales.
      "Cache-Control": "private, no-store",
      // El MIME lo declaró el cliente al subir: que el navegador NO lo
      // re-adivine (nosniff) y lo trate como archivo visualizable con nombre.
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="comprobante.${archivo.contentType.split("/")[1] ?? "bin"}"`,
    },
  });
}

// Fin del endpoint de lectura de comprobantes.
