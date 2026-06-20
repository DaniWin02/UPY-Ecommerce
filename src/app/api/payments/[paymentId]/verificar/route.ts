import { NextResponse } from "next/server";

// POST /api/payments/[paymentId]/verificar — El vendedor verifica o rechaza el comprobante.
export async function POST() {
  // TODO: validar con Zod (decisión: verificado | rechazado, motivo opcional).
  // TODO: auth + autorización: solo el vendedor dueño del producto/orden del pago.
  // TODO: actualizar estado del pago a verificado o rechazado (Drizzle).
  // TODO: si verificado -> orden pagada; si rechazado -> volver a pendiente y notificar.
  return NextResponse.json({ stub: true, route: "POST /api/payments/[paymentId]/verificar", paymentId: null });
}
