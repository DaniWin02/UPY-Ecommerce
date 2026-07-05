"use server";

// Server actions de reglas de IP del panel admin (solo superadmin).
// Mismo patrón que /admin/reportes: Zod sobre FormData, mutación con
// returning, fila de auditoría, invalidación de caché y redirect con banner
// (?ok/?error) SIEMPRE fuera de try/catch porque redirect() lanza.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, not } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, ipRules } from "@/db/schema/ip-rules";
import { ipInCidr } from "@/lib/ip-rules";
import { __invalidarCacheReglas } from "@/lib/ip-rules-db";
import { requireRole } from "@/lib/session";

const RUTA = "/admin/reglas-ip";

// ---------------------------------------------------------------------------
// Schemas Zod (sin export: un módulo "use server" solo exporta funciones async)
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

// Forma sintáctica IPv4[/máscara]; la validación SEMÁNTICA (octetos 0..255,
// máscara 0..32) la hace ipInCidr más abajo, la MISMA función del gate.
const CIDR_FORMA = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?$/;

const crearReglaSchema = z.object({
  cidr: z.string().trim().regex(CIDR_FORMA),
  // Desde esta página solo se gestionan admin/global (vendor tiene su flujo).
  scope: z.enum(["global", "admin"]),
  accion: z.enum(["allow", "deny"]),
  prioridad: z.coerce.number().int().min(0).max(100),
});

// ---------------------------------------------------------------------------
// Auditoría: una fila por mutación, con snapshot de la regla resultante.
// ---------------------------------------------------------------------------

async function auditarRegla(
  actorId: string,
  accion: "regla_ip_creada" | "regla_ip_activada" | "regla_ip_desactivada" | "regla_ip_eliminada",
  regla: typeof ipRules.$inferSelect
): Promise<void> {
  await db.insert(auditLog).values({
    actorId,
    accion,
    entidad: "ip_rules",
    despues: regla,
  });
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

/** Crea una regla de IP (scope admin/global) validando el CIDR con ipInCidr. */
export async function accionCrearRegla(formData: FormData) {
  const user = await requireRole("superadmin");

  const parsed = crearReglaSchema.safeParse({
    cidr: formData.get("cidr"),
    scope: formData.get("scope"),
    accion: formData.get("accion"),
    prioridad: formData.get("prioridad"),
  });
  if (!parsed.success) redirect(`${RUTA}?error=Validacion`);

  // Validación semántica con la MISMA función que evalúa el gate: la IP base
  // del rango debe pertenecer a su propio CIDR. Si ipInCidr la rechaza
  // (octeto > 255, máscara > 32, "010" ambiguo, etc.), el CIDR es inválido y
  // NUNCA matchearía en producción — mejor rechazarlo aquí.
  const ipBase = parsed.data.cidr.split("/")[0];
  if (!ipInCidr(ipBase, parsed.data.cidr)) redirect(`${RUTA}?error=CidrInvalido`);

  const [regla] = await db
    .insert(ipRules)
    .values({
      cidr: parsed.data.cidr,
      scope: parsed.data.scope,
      accion: parsed.data.accion,
      prioridad: parsed.data.prioridad,
    })
    .returning();

  await auditarRegla(user.id, "regla_ip_creada", regla);
  __invalidarCacheReglas();
  revalidatePath(RUTA);
  redirect(`${RUTA}?ok=1`);
}

/** Activa/desactiva una regla (toggle atómico: activo = NOT activo). */
export async function accionToggleRegla(formData: FormData) {
  const user = await requireRole("superadmin");

  const reglaId = uuidSchema.safeParse(formData.get("reglaId"));
  if (!reglaId.success) redirect(`${RUTA}?error=Validacion`);

  // Toggle en un solo UPDATE (sin leer antes): inmune a dobles submits.
  const [regla] = await db
    .update(ipRules)
    .set({ activo: not(ipRules.activo) })
    .where(eq(ipRules.id, reglaId.data))
    .returning();

  if (regla) {
    await auditarRegla(
      user.id,
      regla.activo ? "regla_ip_activada" : "regla_ip_desactivada",
      regla
    );
    __invalidarCacheReglas();
  }

  revalidatePath(RUTA);
  if (!regla) redirect(`${RUTA}?error=NoEncontrada`);
  redirect(`${RUTA}?ok=1`);
}

/** Elimina una regla de IP definitivamente (queda rastro en audit_log). */
export async function accionEliminarRegla(formData: FormData) {
  const user = await requireRole("superadmin");

  const reglaId = uuidSchema.safeParse(formData.get("reglaId"));
  if (!reglaId.success) redirect(`${RUTA}?error=Validacion`);

  const [regla] = await db
    .delete(ipRules)
    .where(eq(ipRules.id, reglaId.data))
    .returning();

  if (regla) {
    await auditarRegla(user.id, "regla_ip_eliminada", regla);
    __invalidarCacheReglas();
  }

  revalidatePath(RUTA);
  if (!regla) redirect(`${RUTA}?error=NoEncontrada`);
  redirect(`${RUTA}?ok=1`);
}

// Fin de las acciones de reglas de IP.
