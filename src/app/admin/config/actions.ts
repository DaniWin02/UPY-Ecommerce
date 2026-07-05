"use server";

// Server actions de la configuración institucional del superadmin.
// Mismo patrón que /admin/reportes: validar FormData con Zod, escribir con
// Drizzle, revalidatePath y redirect con banner (SIEMPRE fuera de try/catch).
//
// CONVENCIÓN del jsonb `institutions.config` (establecida aquí):
//   {
//     puntosEntrega?: string[]  // Puntos de entrega del campus (p. ej. "Edificio A, planta baja").
//                               // Hoy es referencia operativa para las tiendas;
//                               // en V1 el checkout los ofrecerá como opciones.
//   }
// Cualquier clave nueva del config debe documentarse en este bloque.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { institutions } from "@/db/schema/users";
import { requireRole } from "@/lib/session";

// ---------------------------------------------------------------------------
// Schemas y helpers (sin export: un módulo "use server" solo exporta async)
// ---------------------------------------------------------------------------

// Forma tipada del jsonb config según la convención de arriba.
type InstitutionConfig = { puntosEntrega?: string[] };

const nombreSchema = z.string().trim().min(3).max(120);
const puntoSchema = z.string().trim().min(2).max(80);

// Dominio "simple": etiquetas alfanuméricas/guiones/puntos + TLD de 2+ letras.
// No pretende ser un validador RFC completo; la lista es documental (ver page).
const DOMINIO_REGEX = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

const MAX_DOMINIOS = 10;
const MAX_PUNTOS = 20;

/** Única institución del despliegue (una por despliegue; multi-tenant a futuro). */
async function institucionActual() {
  const [institucion] = await db.select().from(institutions).limit(1);
  return institucion ?? null;
}

/**
 * Normaliza el Textarea de dominios (uno por línea): trim + lowercase +
 * quitar "@" inicial + descartar líneas vacías + dedupe conservando orden.
 * Devuelve null si alguna línea no parece un dominio válido.
 */
function parseDominios(raw: string): string[] | null {
  const normalizados = raw
    .split(/\r?\n/)
    .map((linea) => linea.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);

  for (const dominio of normalizados) {
    if (!DOMINIO_REGEX.test(dominio)) return null;
  }
  return Array.from(new Set(normalizados));
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

/** Actualiza nombre y dominios (documentales) de la única institución; la crea si no existe. */
export async function accionActualizarInstitucion(formData: FormData) {
  await requireRole("superadmin");

  const nombre = nombreSchema.safeParse(formData.get("nombre"));
  if (!nombre.success) {
    redirect("/admin/config?error=NombreInvalido");
  }

  const dominios = parseDominios(String(formData.get("dominios") ?? ""));
  if (dominios === null) {
    redirect("/admin/config?error=DominioInvalido");
  }
  if (dominios.length > MAX_DOMINIOS) {
    redirect("/admin/config?error=MaximoDominios");
  }

  const institucion = await institucionActual();
  if (institucion) {
    await db
      .update(institutions)
      .set({ nombre: nombre.data, dominios })
      .where(eq(institutions.id, institucion.id));
  } else {
    // Despliegue sin seed: la primera guardada crea la institución.
    await db.insert(institutions).values({ nombre: nombre.data, dominios });
  }

  revalidatePath("/admin/config");
  redirect("/admin/config?ok=1");
}

/** Agrega un punto de entrega al config jsonb (dedupe, máximo 20). */
export async function accionAgregarPunto(formData: FormData) {
  await requireRole("superadmin");

  const punto = puntoSchema.safeParse(formData.get("punto"));
  if (!punto.success) {
    redirect("/admin/config?error=PuntoInvalido");
  }

  const institucion = await institucionActual();
  if (!institucion) {
    // Sin institución no hay dónde colgar el config: primero guardar la Card "Institución".
    redirect("/admin/config?error=SinInstitucion");
  }

  const config = (institucion.config ?? {}) as InstitutionConfig;
  const puntos = config.puntosEntrega ?? [];

  // Dedupe insensible a mayúsculas para no acumular "Edificio A" y "edificio a".
  if (puntos.some((p) => p.toLowerCase() === punto.data.toLowerCase())) {
    redirect("/admin/config?error=PuntoDuplicado");
  }
  if (puntos.length >= MAX_PUNTOS) {
    redirect("/admin/config?error=MaximoPuntos");
  }

  await db
    .update(institutions)
    .set({ config: { ...config, puntosEntrega: [...puntos, punto.data] } })
    .where(eq(institutions.id, institucion.id));

  revalidatePath("/admin/config");
  redirect("/admin/config?ok=1");
}

/** Elimina un punto de entrega del config jsonb. */
export async function accionEliminarPunto(formData: FormData) {
  await requireRole("superadmin");

  const punto = puntoSchema.safeParse(formData.get("punto"));
  if (!punto.success) {
    redirect("/admin/config?error=PuntoInvalido");
  }

  const institucion = await institucionActual();
  if (!institucion) {
    redirect("/admin/config?error=SinInstitucion");
  }

  const config = (institucion.config ?? {}) as InstitutionConfig;
  const puntos = (config.puntosEntrega ?? []).filter((p) => p !== punto.data);

  await db
    .update(institutions)
    .set({ config: { ...config, puntosEntrega: puntos } })
    .where(eq(institutions.id, institucion.id));

  revalidatePath("/admin/config");
  redirect("/admin/config?ok=1");
}

// Fin de las acciones de configuración institucional.
