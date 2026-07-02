// /api/test/login — BYPASS de login SOLO para pruebas E2E (Playwright).
//
// ============================================================================
// ¡¡ADVERTENCIA!! ESTE ENDPOINT CREA SESIONES SIN PASSWORD NI OAUTH.
// JAMÁS ACTIVAR E2E_TEST_MODE EN PRODUCCIÓN: cualquiera podría iniciar sesión
// como cualquier usuario (incluido superadmin) con un simple POST.
// Si E2E_TEST_MODE !== "true" responde 404 para ni siquiera revelar que existe.
// ============================================================================
//
// ¿Por qué existe? Con session.strategy "database" el provider Credentials de
// Auth.js NO crea sesión persistida, así que no sirve para E2E. El patrón
// correcto es insertar la fila en `sessions` a mano y setear la cookie
// "authjs.session-token" — exactamente lo que hace Auth.js tras un login real.
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, sessions, vendors, vendorMembers } from "@/db/schema";

// Contrato del body: email obligatorio; rol y vendor opcionales.
const bodySchema = z.object({
  email: z.string().email(),
  rolGlobal: z.enum(["comprador", "vendor", "superadmin"]).optional(),
  vendorSlug: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  // Puerta de seguridad: fuera del modo E2E este endpoint NO existe (404).
  if (process.env.E2E_TEST_MODE !== "true") {
    return new NextResponse(null, { status: 404 });
  }

  // Validación del body con zod (400 si el JSON es inválido o no cumple).
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body inválido", detalles: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { email, rolGlobal, vendorSlug } = parsed.data;

  // 1) Busca el usuario por email o créalo (verificado de comunidad desde ya).
  let user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) {
    const [creado] = await db
      .insert(users)
      .values({
        email,
        name: "Usuario E2E",
        verificadoEn: new Date(),
        rolGlobal: rolGlobal ?? "comprador",
      })
      .returning();
    user = creado;
  } else if (rolGlobal && user.rolGlobal !== rolGlobal) {
    // El test pidió un rol concreto para un usuario existente: actualízalo.
    const [actualizado] = await db
      .update(users)
      .set({ rolGlobal })
      .where(eq(users.id, user.id))
      .returning();
    user = actualizado;
  }

  // 2) Si el test pide membresía de tienda: upsert en vendor_members como owner.
  if (vendorSlug) {
    const vendor = await db.query.vendors.findFirst({
      where: eq(vendors.slug, vendorSlug),
    });
    if (!vendor) {
      return NextResponse.json(
        { error: `Vendor con slug "${vendorSlug}" no existe` },
        { status: 400 }
      );
    }
    await db
      .insert(vendorMembers)
      .values({ vendorId: vendor.id, userId: user.id, rol: "owner" })
      // Si ya era miembro, no falles ni pises su rol actual.
      .onConflictDoNothing();
  }

  // 3) Crea la sesión persistida (igual que haría el adaptador tras un login).
  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // +30 días
  await db.insert(sessions).values({ sessionToken, userId: user.id, expires });

  // 4) Devuelve la cookie de sesión de Auth.js v5.
  // Sin "Secure": los E2E corren contra http://localhost.
  const respuesta = NextResponse.json({ userId: user.id, sessionToken });
  respuesta.headers.set(
    "Set-Cookie",
    `authjs.session-token=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}`
  );
  return respuesta;
}

// Fin de /api/test/login
