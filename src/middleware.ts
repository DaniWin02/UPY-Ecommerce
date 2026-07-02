// src/middleware.ts — GATE GLOBAL por IP de Ágora.
// Si IP_GATE_ENABLED está activo, sólo deja pasar IPs permitidas (campus);
// el resto se redirige a /bloqueado (o 403 JSON si es una ruta /api),
// salvo rutas exentas.
// NOTA: con directorio src/, Next.js exige el middleware en src/middleware.ts.
// Corre en edge runtime: sin imports de Node ni acceso a la BD.

import { NextResponse, type NextRequest } from "next/server";
import { isIpAllowed } from "@/lib/ip-rules";

/**
 * Rutas siempre exentas del gate:
 * - /auth y /api/auth: el flujo de login de Auth.js debe poder resolverse.
 * - /api/ip-check: endpoint de diagnóstico de IP.
 * - /bloqueado: la propia página de bloqueo (evita bucles de redirección).
 */
const RUTAS_EXENTAS = ["/auth", "/api/auth", "/api/ip-check", "/bloqueado"];

/**
 * getClientIp — extrae la IP del cliente desde las cabeceras del proxy.
 * Toma la primera IP de x-forwarded-for (con trim); fallback "0.0.0.0".
 * NOTA: la primera IP de XFF es falsificable por el cliente. El anti-spoof
 * serio (tomar la última IP confiable según el número de proxies conocidos
 * delante de la app) llega en Fase 8.
 */
function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0]?.trim() || "0.0.0.0";
}

/**
 * middleware — punto de entrada del gate por IP.
 * Permitida → continúa. No permitida → 403 JSON en /api, redirect al resto.
 */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Dejar pasar las rutas exentas (login / chequeo de IP / bloqueo).
  // Frontera de segmento: "/auth" exenta "/auth" y "/auth/...", pero NO "/authors".
  if (
    RUTAS_EXENTAS.some(
      (ruta) => pathname === ruta || pathname.startsWith(ruta + "/")
    )
  ) {
    return NextResponse.next();
  }

  const ip = getClientIp(req);

  // isIpAllowed ya contempla el flag IP_GATE_ENABLED (apagado → todo pasa).
  if (await isIpAllowed(ip, "global")) {
    return NextResponse.next();
  }

  // IP fuera del campus: las APIs reciben 403 JSON; el resto, redirect.
  if (pathname.startsWith("/api")) {
    return NextResponse.json(
      { error: "Acceso restringido a la red del campus" },
      { status: 403 }
    );
  }

  return NextResponse.redirect(new URL("/bloqueado", req.url));
}

/**
 * config — matcher del middleware.
 * Excluye estáticos de Next y assets para no penalizar su carga.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)).*)",
  ],
};

// Fin de src/middleware.ts
