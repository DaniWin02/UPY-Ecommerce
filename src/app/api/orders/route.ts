import { NextResponse } from "next/server";

// POST /api/orders — Crea una orden.
export async function POST() {
  // TODO: validar payload con Zod (items, vendedor, método de pago SPEI/efectivo).
  // TODO: auth con Auth.js (usuario @uni autenticado); resolver sesión.
  // TODO: reservar stock (transacción Drizzle, decrementar disponible con bloqueo).
  // TODO: generar referencia única de pago y calcular expira_en (TTL de reserva).
  // TODO: crear orden en estado inicial (pendiente_pago) según máquina de estados.
  return NextResponse.json({ stub: true, route: "POST /api/orders", orderId: null });
}

// GET /api/orders — Lista las órdenes del usuario autenticado.
export async function GET() {
  // TODO: auth (usuario actual); consultar órdenes propias con Drizzle, paginadas y ordenadas.
  return NextResponse.json({ stub: true, route: "GET /api/orders", orders: [] });
}
