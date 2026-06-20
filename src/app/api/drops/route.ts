import { NextResponse } from "next/server";

// GET /api/drops — Lista drops activos y próximos.
export async function GET() {
  // TODO: consultar drops con Drizzle filtrando por ventana (inicia_en/termina_en) activos o próximos.
  return NextResponse.json({ stub: true, route: "GET /api/drops", drops: [] });
}

// POST /api/drops — Crea un drop (preventa) por parte de un vendedor.
export async function POST() {
  // TODO: validar payload con Zod (producto, stock, inicia_en, termina_en, precio).
  // TODO: auth + rol vendedor; insertar drop con Drizzle asociado al vendedor.
  return NextResponse.json({ stub: true, route: "POST /api/drops", dropId: null });
}
