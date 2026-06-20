import { NextResponse } from "next/server";

// GET /api/group-buys — Lista compras grupales.
export async function GET() {
  // TODO: consultar compras grupales con Drizzle (por aula, estado abierta/cerrada, progreso de meta).
  return NextResponse.json({ stub: true, route: "GET /api/group-buys", groupBuys: [] });
}

// POST /api/group-buys — Abre una compra grupal por aula.
export async function POST() {
  // TODO: validar payload con Zod (producto, aula, meta de participantes, fecha límite).
  // TODO: auth (usuario @uni); crear compra grupal con Drizzle en estado abierta.
  // TODO: cobrar a los participantes al alcanzar la meta (disparar cobro/órdenes).
  return NextResponse.json({ stub: true, route: "POST /api/group-buys", groupBuyId: null });
}
