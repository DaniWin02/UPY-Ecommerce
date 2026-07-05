"use server";

// Server actions de GESTIÓN DE USUARIOS del superadmin (/admin/usuarios).
// Mismo patrón que /admin/reportes: validar FormData con Zod, escritura con
// guard (returning) y redirect con banner ok/error FUERA de try/catch.
// Todas las acciones preservan la búsqueda activa (?q=) al redirigir.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users, sessions } from "@/db/schema/users";
import { requireRole } from "@/lib/session";

// ---------------------------------------------------------------------------
// Schemas Zod (sin export: un módulo "use server" solo exporta funciones async)
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

// Rol global válido: exactamente la unión del enum rol_global.
const rolSchema = z.enum(["comprador", "vendor", "superadmin"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extrae la búsqueda activa del form (hidden q) para preservarla al redirigir. */
function leerQuery(formData: FormData): string {
  const q = formData.get("q");
  return typeof q === "string" ? q.slice(0, 100) : "";
}

/** Construye /admin/usuarios?q=<q>&<param>=<valor> (q solo si existe). */
function destino(q: string, param: "ok" | "error", valor: string): string {
  const qs = q ? `q=${encodeURIComponent(q)}&` : "";
  return `/admin/usuarios?${qs}${param}=${valor}`;
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

/**
 * Cambia el rol global de un usuario.
 * PROTECCIÓN ANTI-LOCKOUT: el admin no puede quitarse su propio acceso ni
 * degradar al ÚLTIMO superadmin de la plataforma.
 */
export async function accionCambiarRol(formData: FormData) {
  const admin = await requireRole("superadmin");
  const q = leerQuery(formData);

  const userId = uuidSchema.safeParse(formData.get("userId"));
  const rol = rolSchema.safeParse(formData.get("rol"));
  if (!userId.success || !rol.success) {
    redirect(destino(q, "error", "Validacion"));
  }

  // Anti-lockout: solo hay riesgo cuando el rol nuevo NO es superadmin.
  if (rol.data !== "superadmin") {
    // Caso 1: el objetivo es el propio admin que ejecuta la acción.
    if (userId.data === admin.id) {
      redirect(destino(q, "error", "NoTeQuitesAdmin"));
    }

    // Caso 2: el objetivo es el ÚLTIMO superadmin (count=1 y es él).
    const [objetivo] = await db
      .select({ rolGlobal: users.rolGlobal })
      .from(users)
      .where(eq(users.id, userId.data))
      .limit(1);

    if (objetivo?.rolGlobal === "superadmin") {
      const [conteo] = await db
        .select({ total: count() })
        .from(users)
        .where(eq(users.rolGlobal, "superadmin"));
      if ((conteo?.total ?? 0) <= 1) {
        redirect(destino(q, "error", "NoTeQuitesAdmin"));
      }
    }
  }

  // UPDATE con returning: si el usuario ya no existe, avisamos en vez de fingir éxito.
  const actualizados = await db
    .update(users)
    .set({ rolGlobal: rol.data })
    .where(eq(users.id, userId.data))
    .returning({ id: users.id });

  revalidatePath("/admin/usuarios");
  // redirect() lanza excepción: SIEMPRE fuera de try/catch.
  if (actualizados.length === 0) redirect(destino(q, "error", "UsuarioNoExiste"));
  redirect(destino(q, "ok", "RolActualizado"));
}

/**
 * Cierra TODAS las sesiones del usuario (DELETE en sessions).
 * Con estrategia de sesión en base de datos la expulsión es inmediata.
 */
export async function accionCerrarSesiones(formData: FormData) {
  await requireRole("superadmin");
  const q = leerQuery(formData);

  const userId = uuidSchema.safeParse(formData.get("userId"));
  if (!userId.success) {
    redirect(destino(q, "error", "Validacion"));
  }

  await db.delete(sessions).where(eq(sessions.userId, userId.data));

  revalidatePath("/admin/usuarios");
  redirect(destino(q, "ok", "SesionesCerradas"));
}

/**
 * Verificación de comunidad MANUAL: verificadoEn = now() solo si estaba null.
 * (Alta manual para correos válidos que no pasaron el flujo automático.)
 */
export async function accionVerificarComunidad(formData: FormData) {
  await requireRole("superadmin");
  const q = leerQuery(formData);

  const userId = uuidSchema.safeParse(formData.get("userId"));
  if (!userId.success) {
    redirect(destino(q, "error", "Validacion"));
  }

  // Guard de concurrencia: solo verifica si SIGUE sin verificar.
  const actualizados = await db
    .update(users)
    .set({ verificadoEn: new Date() })
    .where(and(eq(users.id, userId.data), isNull(users.verificadoEn)))
    .returning({ id: users.id });

  revalidatePath("/admin/usuarios");
  if (actualizados.length === 0) redirect(destino(q, "error", "YaVerificado"));
  redirect(destino(q, "ok", "Verificado"));
}

// Fin de las acciones de gestión de usuarios.
