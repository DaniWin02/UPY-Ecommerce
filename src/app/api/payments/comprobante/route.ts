import { NextResponse } from "next/server";

// POST /api/payments/comprobante — Recibe el comprobante de pago manual.
export async function POST() {
  // TODO: validar entrada con Zod (paymentId, archivo: tipo/tamaño permitidos).
  // TODO: auth (dueño del pago/orden).
  // TODO: subir el comprobante a S3/R2 y guardar la URL/clave en el payment (Drizzle).
  // TODO: transicionar el pago/orden a estado comprobante_enviado.
  return NextResponse.json({ stub: true, route: "POST /api/payments/comprobante", paymentId: null });
}
