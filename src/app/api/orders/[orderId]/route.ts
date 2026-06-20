import { NextResponse } from "next/server";

// GET /api/orders/[orderId] — Detalle de una orden.
export async function GET() {
  // TODO: auth y autorización (dueño de la orden o vendedor involucrado).
  // TODO: cargar orden + items + pago con Drizzle; validar orderId con Zod.
  return NextResponse.json({ stub: true, route: "GET /api/orders/[orderId]", order: null });
}

// PATCH /api/orders/[orderId] — Cambia el estado de la orden.
export async function PATCH() {
  // TODO: validar nuevo estado con Zod; auth y rol según transición.
  // TODO: aplicar máquina de estados (transiciones válidas: pendiente_pago -> comprobante_enviado
  //       -> pagada/cancelada -> entregada; liberar stock en cancelación/expiración).
  return NextResponse.json({ stub: true, route: "PATCH /api/orders/[orderId]", order: null });
}
