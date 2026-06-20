import { NextResponse } from "next/server";

// GET /api/ip-check — Indica si la IP del request está permitida por el gate. Ruta exenta del gate de IP.
export async function GET() {
  // TODO: extraer IP del request (cabeceras x-forwarded-for / x-real-ip).
  // TODO: evaluar con "@/lib/ip-rules" (isIpAllowed) contra rangos permitidos del campus.
  return NextResponse.json({ stub: true, route: "GET /api/ip-check", ip: null, allowed: false });
}
