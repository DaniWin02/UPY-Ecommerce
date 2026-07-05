"use server";

// Server actions de GESTIÓN DE TIENDAS del superadmin (panel /admin/vendors).
// Mismo patrón que /admin/reportes: validar FormData con Zod, escrituras con
// guard (returning), revalidatePath y redirect con banner ?ok=/?error=.
// TODAS exigen requireRole("superadmin") — doble capa aunque el layout ya proteja.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vendors, vendorMembers } from "@/db/schema/vendors";
import { users } from "@/db/schema/users";
import { requireRole } from "@/lib/session";

const RUTA = "/admin/vendors";

// ---------------------------------------------------------------------------
// Schemas Zod (sin export: un módulo "use server" solo exporta funciones async)
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

// Convierte "" (campo vacío de FormData) en undefined para campos opcionales.
const vacioAUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

// CLABE interbancaria: exactamente 18 dígitos, o vacía (→ null en la BD).
const clabeSchema = z.preprocess(
  vacioAUndefined,
  z
    .string()
    .trim()
    .regex(/^\d{18}$/, "La CLABE debe tener exactamente 18 dígitos")
    .optional()
);

// Datos editables de una tienda (alta y edición comparten este shape).
const datosTiendaSchema = z.object({
  nombre: z.string().trim().min(3).max(80),
  tipo: z.enum(["facultad", "club", "emprendimiento"]),
  clabe: clabeSchema,
  aulaDefault: z.preprocess(
    vacioAUndefined,
    z.string().trim().max(80).optional()
  ),
});

// Correos siempre en minúsculas: users.email se guarda normalizado.
const emailSchema = z.string().trim().toLowerCase().email();

// Estados que el superadmin puede fijar directamente (aprobar/suspender/reactivar).
const nuevoEstadoSchema = z.enum(["activo", "suspendido"]);

const rolMiembroSchema = z.enum(["owner", "staff"]);

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

// Slug legible desde el nombre: sin acentos, minúsculas, guiones.
// Ej.: "Club de Robótica UPY" → "club-de-robotica-upy".
function generarSlug(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[\u{300}-\u{36f}]/gu, "") // quita marcas diacríticas (acentos)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // todo lo demás → guiones
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "tienda";
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

/** Aprueba (→ activo), suspende o reactiva una tienda. */
export async function accionCambiarEstadoVendor(formData: FormData) {
  await requireRole("superadmin");

  const vendorId = uuidSchema.safeParse(formData.get("vendorId"));
  const nuevoEstado = nuevoEstadoSchema.safeParse(formData.get("nuevoEstado"));
  if (!vendorId.success || !nuevoEstado.success) {
    redirect(`${RUTA}?error=Validacion`);
  }

  // Guard: UPDATE por id con returning — si la tienda no existe, avisamos.
  const actualizadas = await db
    .update(vendors)
    .set({ estado: nuevoEstado.data })
    .where(eq(vendors.id, vendorId.data))
    .returning({ id: vendors.id });

  revalidatePath(RUTA);
  // redirect() lanza excepción: SIEMPRE fuera de try/catch.
  if (actualizadas.length === 0) redirect(`${RUTA}?error=NoEncontrada`);
  redirect(`${RUTA}?ok=estado`);
}

/** Actualiza nombre, tipo, CLABE y aula por defecto de una tienda. */
export async function accionActualizarVendor(formData: FormData) {
  await requireRole("superadmin");

  const vendorId = uuidSchema.safeParse(formData.get("vendorId"));
  const datos = datosTiendaSchema.safeParse({
    nombre: formData.get("nombre"),
    tipo: formData.get("tipo"),
    clabe: formData.get("clabe"),
    aulaDefault: formData.get("aulaDefault"),
  });
  if (!vendorId.success || !datos.success) {
    redirect(`${RUTA}?error=Validacion`);
  }

  const actualizadas = await db
    .update(vendors)
    .set({
      nombre: datos.data.nombre,
      tipo: datos.data.tipo,
      clabe: datos.data.clabe ?? null,
      aulaDefault: datos.data.aulaDefault ?? null,
    })
    .where(eq(vendors.id, vendorId.data))
    .returning({ id: vendors.id });

  revalidatePath(RUTA);
  if (actualizadas.length === 0) redirect(`${RUTA}?error=NoEncontrada`);
  redirect(`${RUTA}?ok=actualizada`);
}

/** Crea una tienda ACTIVA con su owner (usuario ya registrado) como primer miembro. */
export async function accionCrearVendor(formData: FormData) {
  await requireRole("superadmin");

  const datos = datosTiendaSchema.safeParse({
    nombre: formData.get("nombre"),
    tipo: formData.get("tipo"),
    clabe: formData.get("clabe"),
    aulaDefault: formData.get("aulaDefault"),
  });
  const ownerEmail = emailSchema.safeParse(formData.get("ownerEmail"));
  if (!datos.success || !ownerEmail.success) {
    redirect(`${RUTA}?error=Validacion`);
  }

  // El owner DEBE existir ya (el alta de usuarios es por registro propio).
  const [owner] = await db
    .select({ id: users.id, rolGlobal: users.rolGlobal })
    .from(users)
    .where(eq(users.email, ownerEmail.data))
    .limit(1);
  if (!owner) redirect(`${RUTA}?error=OwnerNoExiste`);

  // Slug único: base y, si choca el UNIQUE, sufijos -2, -3… (máx. 5 intentos).
  const base = generarSlug(datos.data.nombre);
  let slugLibre: string | null = null;
  for (let intento = 1; intento <= 5; intento++) {
    const candidato = intento === 1 ? base : `${base}-${intento}`;
    const [ocupado] = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.slug, candidato))
      .limit(1);
    if (!ocupado) {
      slugLibre = candidato;
      break;
    }
  }
  if (!slugLibre) redirect(`${RUTA}?error=SlugNoDisponible`);
  const slug = slugLibre; // narrow a string para la clausura de la transacción

  // Transacción: tienda activa + membresía owner + ascenso de rol (todo o nada).
  await db.transaction(async (tx) => {
    const [nueva] = await tx
      .insert(vendors)
      .values({
        slug,
        nombre: datos.data.nombre,
        tipo: datos.data.tipo,
        clabe: datos.data.clabe ?? null,
        aulaDefault: datos.data.aulaDefault ?? null,
        estado: "activo", // la crea el superadmin: nace aprobada
      })
      .returning({ id: vendors.id });

    await tx.insert(vendorMembers).values({
      vendorId: nueva.id,
      userId: owner.id,
      rol: "owner",
    });

    // Solo se asciende a comprador → vendor; jamás se toca a un superadmin.
    if (owner.rolGlobal === "comprador") {
      await tx
        .update(users)
        .set({ rolGlobal: "vendor" })
        .where(eq(users.id, owner.id));
    }
  });

  revalidatePath(RUTA);
  redirect(`${RUTA}?ok=creada`);
}

/** Agrega un miembro (owner|staff) a una tienda existente por correo. */
export async function accionAgregarMiembro(formData: FormData) {
  await requireRole("superadmin");

  const vendorId = uuidSchema.safeParse(formData.get("vendorId"));
  const email = emailSchema.safeParse(formData.get("email"));
  const rol = rolMiembroSchema.safeParse(formData.get("rol"));
  if (!vendorId.success || !email.success || !rol.success) {
    redirect(`${RUTA}?error=Validacion`);
  }

  // La tienda debe existir (evita violar la FK con un id manipulado).
  const [tienda] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(eq(vendors.id, vendorId.data))
    .limit(1);
  if (!tienda) redirect(`${RUTA}?error=NoEncontrada`);

  const [miembro] = await db
    .select({ id: users.id, rolGlobal: users.rolGlobal })
    .from(users)
    .where(eq(users.email, email.data))
    .limit(1);
  if (!miembro) redirect(`${RUTA}?error=UsuarioNoExiste`);

  await db.transaction(async (tx) => {
    // Upsert idempotente sobre la PK compuesta (vendor_id, user_id):
    // si ya era miembro, no se duplica ni se cambia su rol actual.
    await tx
      .insert(vendorMembers)
      .values({ vendorId: tienda.id, userId: miembro.id, rol: rol.data })
      .onConflictDoNothing();

    if (miembro.rolGlobal === "comprador") {
      await tx
        .update(users)
        .set({ rolGlobal: "vendor" })
        .where(eq(users.id, miembro.id));
    }
  });

  revalidatePath(RUTA);
  redirect(`${RUTA}?ok=miembro`);
}

// Fin de las acciones de gestión de tiendas.
