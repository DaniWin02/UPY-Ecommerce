// GET /api/ip-check — diagnóstico del gate por IP.
// Devuelve la IP detectada (misma lógica anti-spoof que el middleware), si el
// gate global está activo y si esa IP estaría permitida. Es una ruta EXENTA
// del gate (ver RUTAS_EXENTAS en src/middleware.ts) precisamente para poder
// configurar CAMPUS_CIDRS / TRUSTED_PROXIES desde una red aún no permitida.
import { NextResponse, type NextRequest } from "next/server";
import { extraerIpCliente, isIpAllowed } from "@/lib/ip-rules";

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Misma extracción que el middleware: desde la derecha de x-forwarded-for,
  // saltando TRUSTED_PROXIES entradas propias; fallback "0.0.0.0".
  const ip =
    extraerIpCliente(
      req.headers.get("x-forwarded-for"),
      Number(process.env.TRUSTED_PROXIES ?? "0")
    ) ?? "0.0.0.0";

  const gateActivo = process.env.IP_GATE_ENABLED === "true";

  // OJO: con el gate apagado isIpAllowed devuelve true para cualquier IP;
  // `permitida` refleja lo que el gate haría AHORA con su configuración actual.
  const permitida = await isIpAllowed(ip, "global");

  // no-store: es diagnóstico en vivo, jamás debe servirse cacheado.
  return NextResponse.json(
    { ip, gateActivo, permitida },
    { headers: { "Cache-Control": "no-store" } }
  );
}
// Fin de GET /api/ip-check
