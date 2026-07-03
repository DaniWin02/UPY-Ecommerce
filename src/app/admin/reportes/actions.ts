"use server";

// Server action de la cola de reportes del superadmin (moderación mínima).
// Mismo patrón que las acciones de comprobantes del vendor: validar FormData
// con Zod, UPDATE con guard de estado (returning) y redirect con banner.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { messageReports } from "@/db/schema/messaging";
import { requireRole } from "@/lib/session";

// ---------------------------------------------------------------------------
// Schemas Zod (sin export: un módulo "use server" solo exporta funciones async)
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

// Resoluciones válidas: valida contra la unión del enum reporte_estado
// (nunca se acepta "pendiente" como resolución).
const resolucionSchema = z.enum(["revisado", "descartado"]);

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

/** Resuelve un reporte pendiente (estado → revisado|descartado + revisadoPor). */
export async function accionResolverReporte(formData: FormData) {
  const user = await requireRole("superadmin");

  const reportId = uuidSchema.safeParse(formData.get("reportId"));
  const resolucion = resolucionSchema.safeParse(formData.get("resolucion"));
  if (!reportId.success || !resolucion.success) {
    redirect("/admin/reportes?error=Validacion");
  }

  // Guard de concurrencia: solo se resuelve si SIGUE pendiente. Si otro
  // superadmin lo resolvió antes, returning viene vacío y avisamos.
  const actualizados = await db
    .update(messageReports)
    .set({ estado: resolucion.data, revisadoPor: user.id })
    .where(
      and(
        eq(messageReports.id, reportId.data),
        eq(messageReports.estado, "pendiente")
      )
    )
    .returning({ id: messageReports.id });

  revalidatePath("/admin/reportes");
  // redirect() lanza excepción: SIEMPRE fuera de try/catch.
  if (actualizados.length === 0) redirect("/admin/reportes?error=YaResuelto");
  redirect("/admin/reportes?ok=1");
}

// Fin de las acciones de la cola de reportes.
