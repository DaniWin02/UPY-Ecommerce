// Tests de integración del adaptador de Auth.js contra NUESTRO esquema Drizzle.
//
// Esta suite es LA verificación de que las tablas users/accounts/sessions/
// verificationTokens de "@/db/schema" son compatibles con DrizzleAdapter:
// construye el adaptador real con el db del helper y ejercita el ciclo
// completo (usuario → cuenta OAuth → sesión → token de verificación).
//
// Los casos comparten estado (userId/email) y dependen del orden: Vitest los
// ejecuta secuencialmente dentro del archivo (y el proyecto integration corre
// en singleFork). Datos propios con randomUUID; afterAll borra el user (la
// cascada limpia accounts/sessions) y cierra el pool.
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db, schema, closeDb } from "./helpers/db";

// Adaptador real con el mapeo explícito de nuestras tablas.
const adapter = DrizzleAdapter(db, {
  usersTable: schema.users,
  accountsTable: schema.accounts,
  sessionsTable: schema.sessions,
  verificationTokensTable: schema.verificationTokens,
});

// Datos propios de la suite (email único para no chocar con seed ni otras suites).
// OJO: userId NO se pre-genera — como users.id tiene defaultRandom(), el
// adaptador DESCARTA el id que se le pasa y deja que la BD lo genere
// (comportamiento verificado de @auth/drizzle-adapter). Se captura del retorno.
let userId: string;
const email = `adapter-${randomUUID()}@alumno.upy.edu.mx`;
const provider = "google";
const providerAccountId = randomUUID();
const sessionToken = randomUUID();

afterAll(async () => {
  // La FK con onDelete cascade limpia accounts y sessions del usuario.
  // Guard: si createUser falló, userId queda undefined y no hay nada que borrar.
  if (userId) {
    await db.delete(schema.users).where(eq(schema.users.id, userId));
  }
  await closeDb();
});

describe("DrizzleAdapter sobre @/db/schema", () => {
  it("createUser crea el usuario y devuelve id y email", async () => {
    const user = await adapter.createUser!({
      id: randomUUID(), // el adaptador lo ignora (defaultRandom en la tabla)
      email,
      name: "Test",
      emailVerified: null,
      image: null,
    });

    expect(user).toBeTruthy();
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/); // uuid generado por la BD
    expect(user.email).toBe(email);
    userId = user.id; // el resto de la suite usa el id REAL
  });

  it("getUserByEmail encuentra al usuario recién creado", async () => {
    const user = await adapter.getUserByEmail!(email);

    expect(user).toBeTruthy();
    expect(user?.id).toBe(userId);
    expect(user?.email).toBe(email);
  });

  it("getUserByEmail devuelve null para un email inexistente", async () => {
    const user = await adapter.getUserByEmail!(
      `no-existe-${randomUUID()}@upy.edu.mx`
    );

    // Flexible: algunos adaptadores devuelven undefined en vez de null.
    expect(user ?? null).toBeNull();
  });

  it("linkAccount vincula una cuenta OAuth y getUserByAccount la resuelve", async () => {
    // linkAccount no debe lanzar con las columnas snake_case de OAuth.
    await adapter.linkAccount!({
      userId,
      type: "oauth",
      provider,
      providerAccountId,
      access_token: "tok",
      token_type: "bearer",
      scope: "openid",
    });

    const user = await adapter.getUserByAccount!({
      provider,
      providerAccountId,
    });

    expect(user).toBeTruthy();
    expect(user?.id).toBe(userId);
    expect(user?.email).toBe(email);
  });

  it("createSession crea la sesión y getSessionAndUser la devuelve con su user", async () => {
    const expires = new Date(Date.now() + 60 * 60 * 1000); // +1 hora

    const session = await adapter.createSession!({
      sessionToken,
      userId,
      expires,
    });

    expect(session).toBeTruthy();
    expect(session.sessionToken).toBe(sessionToken);

    const result = await adapter.getSessionAndUser!(sessionToken);

    expect(result).toBeTruthy();
    expect(result?.session.userId).toBe(userId);
    expect(result?.user.email).toBe(email);
  });

  it("deleteSession elimina la sesión (getSessionAndUser → null)", async () => {
    await adapter.deleteSession!(sessionToken);

    const result = await adapter.getSessionAndUser!(sessionToken);

    expect(result ?? null).toBeNull();
  });

  it("useVerificationToken devuelve el token y lo CONSUME (un solo uso)", async () => {
    const token = randomUUID();
    const expires = new Date(Date.now() + 10 * 60 * 1000); // +10 minutos

    await adapter.createVerificationToken!({
      identifier: email,
      token,
      expires,
    });

    // Primer uso: lo devuelve.
    const used = await adapter.useVerificationToken!({
      identifier: email,
      token,
    });

    expect(used).toBeTruthy();
    expect(used?.identifier).toBe(email);
    expect(used?.token).toBe(token);

    // Segundo uso: ya fue consumido, debe ser null.
    const reused = await adapter.useVerificationToken!({
      identifier: email,
      token,
    });

    expect(reused ?? null).toBeNull();
  });

  it("updateUser refleja el cambio de nombre", async () => {
    const updated = await adapter.updateUser!({
      id: userId,
      name: "Renombrado",
    });

    expect(updated).toBeTruthy();
    expect(updated.name).toBe("Renombrado");

    // Verificación extra: la lectura por email también trae el nombre nuevo.
    const fetched = await adapter.getUserByEmail!(email);
    expect(fetched?.name).toBe("Renombrado");
  });
});
