// Helpers de sesión y autorización para RSC y route handlers (Ágora Campus).
// Se apoyan en el contrato de Auth.js expuesto por src/lib/auth.ts:
//   auth(): Promise<Session | null>, con Session.user = { id, rolGlobal, email, name }.
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { vendorMembers, vendors } from "@/db/schema/vendors";

// Usuario de sesión normalizado que consumen los paneles y las páginas RSC.
export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  rolGlobal: "comprador" | "vendor" | "superadmin";
};

/** Sesión actual o null (RSC y route handlers). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;

  // Normalizamos al shape propio para no arrastrar el tipo de Auth.js por la app.
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name ?? null,
    rolGlobal: session.user.rolGlobal,
  };
}

/** Exige sesión; si no hay, redirige a /auth/login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  // redirect() de next/navigation LANZA una excepción: no continúa la ejecución.
  if (!user) redirect("/auth/login");
  return user;
}

/**
 * Exige un rol exacto:
 * - Anónimo → redirect a /auth/login (lo resuelve requireUser).
 * - Rol incorrecto → redirect("/").
 * - superadmin SIEMPRE pasa, sin importar el rol exigido.
 */
export async function requireRole(
  rol: "vendor" | "superadmin"
): Promise<SessionUser> {
  const user = await requireUser();
  if (user.rolGlobal === "superadmin") return user; // superadmin tiene paso libre
  if (user.rolGlobal !== rol) redirect("/");
  return user;
}

/**
 * Membresías del usuario actual en vendor_members (con join a vendors
 * para exponer slug y nombre del escaparate).
 * - Exige sesión (anónimo → login).
 * - Sin membresías y sin ser superadmin → redirect("/").
 * - superadmin pasa AUNQUE no tenga membresías (memberships puede ir vacío
 *   para él: el panel debe contemplar ese caso).
 */
export async function requireVendorMember(): Promise<{
  user: SessionUser;
  memberships: Array<{
    vendorId: string;
    rol: "owner" | "staff";
    slug: string;
    nombre: string;
  }>;
}> {
  const user = await requireUser();

  // "Mis tiendas": filas de vendor_members del usuario + datos del vendor.
  const rows = await db
    .select({
      vendorId: vendorMembers.vendorId,
      rol: vendorMembers.rol,
      slug: vendors.slug,
      nombre: vendors.nombre,
    })
    .from(vendorMembers)
    .innerJoin(vendors, eq(vendorMembers.vendorId, vendors.id))
    .where(eq(vendorMembers.userId, user.id))
    // Orden estable: sin ORDER BY, Postgres no garantiza el orden y
    // memberships[0] (la "tienda actual" del panel MVP) podría bailar.
    .orderBy(vendorMembers.vendorId);

  // Sin membresías: solo el superadmin puede entrar igualmente (auditoría/soporte).
  if (rows.length === 0 && user.rolGlobal !== "superadmin") redirect("/");

  return { user, memberships: rows };
}

// Fin de los helpers de sesión.
