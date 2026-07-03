// GET /api/cron/mantenimiento — mantenimiento periódico para entornos
// SERVERLESS (Vercel Cron), donde pg-boss no puede vivir:
//   1. Expira órdenes vencidas (libera reservas de stock).
//   2. Ejecuta el rollup de analytics (ayer + hoy, idempotente).
//   3. Los domingos, purga eventos crudos con más de 180 días.
//
// En self-host pg-boss hace esto mismo con mejor granularidad (barrido cada
// 5 min); el plan Hobby de Vercel permite crons DIARIOS, así que una orden
// vencida puede tardar hasta ~24 h extra en liberar su reserva. Aceptable
// para el MVP (el TTL base ya es de 48 h) y documentado.
//
// SEGURIDAD: si CRON_SECRET está definido (Vercel lo inyecta al configurarlo),
// se exige el header `Authorization: Bearer <CRON_SECRET>` — así nadie puede
// dispararlo desde fuera. Sin CRON_SECRET (dev local) queda abierto en local.
import { NextResponse } from "next/server";
import { barrerOrdenesExpiradas } from "@/lib/orders";
import { ejecutarRollup, purgarEventosAntiguos } from "@/lib/rollups";

// Trabajo potencialmente largo (barrido + agregaciones): amplía el límite.
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  const secreto = process.env.CRON_SECRET;
  if (secreto) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secreto}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  try {
    const expiradas = await barrerOrdenesExpiradas();
    const rollup = await ejecutarRollup();
    // Purga semanal: solo los domingos (UTC) para no pagar el DELETE a diario.
    const purgados =
      new Date().getUTCDay() === 0 ? await purgarEventosAntiguos(180) : 0;

    return NextResponse.json({ ok: true, expiradas, rollup, purgados });
  } catch (error) {
    console.error("[cron] mantenimiento falló:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// Fin del cron de mantenimiento.
