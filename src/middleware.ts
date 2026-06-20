// src/middleware.ts — GATE GLOBAL por IP de Ágora (STUB).
// Si IP_GATE_ENABLED está activo, sólo deja pasar IPs permitidas (campus);
// el resto se redirige a una página de bloqueo, salvo rutas exentas.
// NOTA: con directorio src/, Next.js exige el middleware en src/middleware.ts.

// TODO: descomentar cuando se use el tipado real de Next.js.
// import { NextResponse, type NextRequest } from "next/server";
import { IP_GATE_ENABLED, isIpAllowed } from "@/lib/ip-rules";

/** Rutas siempre exentas del gate (login y verificación de IP). */
const RUTAS_EXENTAS = ["/auth", "/api/ip-check", "/bloqueado"];

/**
 * getClientIp — extrae la IP real del cliente desde las cabeceras del proxy.
 * TODO: validar cabeceras de confianza (x-forwarded-for / x-real-ip).
 */
function getClientIp(req: { headers: { get(name: string): string | null } }): string {
  // TODO: tomar la primera IP de x-forwarded-for de forma segura.
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0]?.trim() || "0.0.0.0";
}

/**
 * middleware — punto de entrada del gate por IP.
 * TODO: tipar como (req: NextRequest) => Promise<NextResponse> con Next.js real.
 */
export async function middleware(req: any): Promise<any> {
  // Si el gate está apagado, continuar sin verificar.
  if (!IP_GATE_ENABLED) {
    // return NextResponse.next();
    return undefined;
  }

  const { pathname } = req.nextUrl ?? { pathname: "/" };

  // Dejar pasar las rutas exentas (login / chequeo de IP / bloqueo).
  if (RUTAS_EXENTAS.some((ruta) => pathname.startsWith(ruta))) {
    // return NextResponse.next();
    return undefined;
  }

  const ip = getClientIp(req);
  const permitido = await isIpAllowed(ip, "global");

  if (!permitido) {
    // TODO: redirigir a la página de bloqueo.
    // const url = req.nextUrl.clone();
    // url.pathname = "/bloqueado";
    // return NextResponse.redirect(url);
    return undefined;
  }

  // TODO: continuar la petición.
  // return NextResponse.next();
  return undefined;
}

/**
 * config — matcher del middleware.
 * Excluye estáticos de Next y assets para no penalizar su carga.
 */
export const config = {
  matcher: [
    // TODO: ajustar el matcher según rutas públicas/privadas reales.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)).*)",
  ],
};

// Fin de src/middleware.ts
