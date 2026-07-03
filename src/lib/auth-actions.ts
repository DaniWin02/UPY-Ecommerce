"use server";
// auth-actions.ts — server actions del login propio (email institucional + contraseña).
//
// Auth.js v5 con session.strategy "database" honra CUALQUIER fila de `sessions`
// cuya cookie de sesión llegue con el nombre correcto (mismo patrón que
// /api/test/login): auth() busca el token en la cookie, lee la fila y devuelve
// la sesión. Aquí reproducimos exactamente lo que hace el adaptador tras un
// login real, sin pasar por un provider de Auth.js.
//
// NOTA: sin verificación de correo por ahora (sin Resend) — cualquiera con un
// correo del dominio permitido puede registrarse; la verificación REAL de
// propiedad del correo llegará cuando se active el magic link.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, sessions } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";
import { isEmailDomainAllowed } from "@/lib/auth-domains";
import { permitirIntento, claveConIp } from "@/lib/rate-limit";

// Duración de la sesión: 30 días (igual que el default de Auth.js).
const SESION_MS = 30 * 24 * 60 * 60 * 1000;

// Rate limiting: 5 intentos / 15 min por email+IP (módulo compartido
// @/lib/rate-limit — el limitador que vivía aquí se extrajo en Fase 8).
const AUTH_MAX_INTENTOS = 5;
const AUTH_VENTANA_MS = 15 * 60_000;

// Longitud máxima de contraseña aceptada: evita costear scrypt sobre entradas
// gigantes (DoS) y acota el trabajo por request.
const PASSWORD_MAX = 128;

// HASH_DUMMY — hash precomputado al cargar el módulo (la promesa arranca ya;
// se resuelve una sola vez). Cuando el email NO existe, verificamos la password
// contra este hash para que la respuesta tarde lo mismo que con un usuario
// real y no se pueda enumerar correos por tiempo de respuesta.
const HASH_DUMMY = hashPassword("dummy-timing");

// Flag de cookie segura: MISMO predicado que usará Auth.js para decidir si la
// cookie lleva prefijo __Secure- (lo deduce de si la URL de la app es https).
// Si nuestro nombre/flag no coincide con el suyo, auth() no encuentra la
// sesión — por eso derivamos ambos del mismo predicado, y no solo de NODE_ENV.
const esSeguro =
  (process.env.AUTH_URL ?? process.env.APP_URL ?? "").startsWith("https") ||
  process.env.NODE_ENV === "production";

/**
 * crearSesion — inserta la fila en `sessions` y setea la cookie de Auth.js.
 *
 * Nombre de la cookie: Auth.js usa "authjs.session-token" en HTTP y busca el
 * nombre con prefijo "__Secure-" cuando opera con cookies seguras (HTTPS en
 * producción). Si el nombre no coincide con el entorno, auth() no encuentra
 * la sesión — por eso el nombre y el flag Secure van juntos por NODE_ENV.
 */
async function crearSesion(userId: string): Promise<void> {
  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + SESION_MS);

  // 1) Fila persistida: es la fuente de verdad (revocable borrándola).
  await db.insert(sessions).values({ sessionToken, userId, expires });

  // 2) Cookie que auth() usará para resolver la sesión. Nombre y flag Secure
  // salen del MISMO predicado esSeguro (ver arriba) para coincidir con Auth.js.
  const cookieStore = await cookies();
  cookieStore.set(
    esSeguro ? "__Secure-authjs.session-token" : "authjs.session-token",
    sessionToken,
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: esSeguro,
      expires,
    }
  );
}

/**
 * loginConCredenciales — email institucional + contraseña.
 * Ante cualquier fallo redirige con el MISMO error genérico
 * (CredencialesInvalidas) para no filtrar si el correo existe o no.
 */
export async function loginConCredenciales(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  // Rate limit por email+IP: frena fuerza bruta sobre una cuenta concreta.
  const clave = await claveConIp(`login:${email}`);
  if (!permitirIntento(clave, AUTH_MAX_INTENTOS, AUTH_VENTANA_MS)) {
    redirect("/auth/login?error=DemasiadosIntentos");
  }

  // Password absurdamente larga: credenciales inválidas SIN pasar por scrypt
  // (evita gastar CPU derivando claves de entradas gigantes).
  if (password.length > PASSWORD_MAX) {
    redirect("/auth/login?error=CredencialesInvalidas");
  }

  const user = email
    ? await db.query.users.findFirst({ where: eq(users.email, email) })
    : undefined;

  // user inexistente, cuenta solo-OAuth (passwordHash null) o password mala:
  // mismo mensaje genérico en los tres casos.
  if (!user) {
    // Igualar tiempos: sin usuario también se paga un scrypt (contra el hash
    // dummy) para que no se pueda enumerar correos midiendo la respuesta.
    await verifyPassword(password, await HASH_DUMMY);
    redirect("/auth/login?error=CredencialesInvalidas");
  }
  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    redirect("/auth/login?error=CredencialesInvalidas");
  }

  await crearSesion(user.id);
  redirect("/");
}

/**
 * registrarse — alta con correo institucional + contraseña.
 * Validaciones en orden; cada fallo vuelve a /auth/registro?error=<código>.
 */
export async function registrarse(formData: FormData): Promise<void> {
  // Nombre acotado a 120 chars (se trunca en vez de rechazar: campo no crítico).
  const nombre = String(formData.get("nombre") ?? "").trim().slice(0, 120);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmar = String(formData.get("confirmar") ?? "");

  // 0) Rate limit por email+IP: frena altas masivas / fuerza bruta de registro.
  const clave = await claveConIp(`registro:${email}`);
  if (!permitirIntento(clave, AUTH_MAX_INTENTOS, AUTH_VENTANA_MS)) {
    redirect("/auth/registro?error=DemasiadosIntentos");
  }

  // 1) Comunidad cerrada: solo dominios institucionales permitidos.
  if (!isEmailDomainAllowed(email)) {
    redirect("/auth/registro?error=DominioNoPermitido");
  }
  // 2) Longitud de contraseña: mínimo usable y máximo anti-DoS de scrypt.
  if (password.length < 8) {
    redirect("/auth/registro?error=PasswordCorta");
  }
  if (password.length > PASSWORD_MAX) {
    redirect("/auth/registro?error=PasswordLarga");
  }
  // 3) Confirmación de contraseña.
  if (password !== confirmar) {
    redirect("/auth/registro?error=NoCoincide");
  }
  // 4) Email único.
  const existente = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existente) {
    redirect("/auth/registro?error=ExisteCuenta");
  }

  // Alta: verificadoEn se marca YA porque el dominio pasó el filtro de
  // comunidad. (Sin verificación de correo por ahora — sin Resend — cualquiera
  // con un correo del dominio puede registrarse; la verificación real de
  // propiedad del correo llega cuando se active el magic link.)
  //
  // Carrera de registro: dos requests simultáneos pueden pasar ambos el check
  // de "email único" de arriba; el índice UNIQUE de la BD decide y el perdedor
  // recibe 23505 (unique_violation) → mismo error ExisteCuenta. El redirect va
  // FUERA del catch porque redirect() lanza y el catch se la tragaría.
  let nuevo: { id: string } | undefined;
  let emailDuplicado = false;
  try {
    [nuevo] = await db
      .insert(users)
      .values({
        name: nombre || null,
        email,
        verificadoEn: new Date(),
        passwordHash: await hashPassword(password),
      })
      .returning();
  } catch (error) {
    // El code de pg puede venir en el error directo o anidado en error.cause.
    const code =
      (error as { code?: string })?.code ??
      ((error as { cause?: { code?: string } })?.cause?.code);
    if (code === "23505") {
      emailDuplicado = true;
    } else {
      throw error; // cualquier otro fallo de BD NO es "cuenta existente"
    }
  }
  if (emailDuplicado || !nuevo) {
    redirect("/auth/registro?error=ExisteCuenta");
  }

  await crearSesion(nuevo.id);
  redirect("/");
}

/**
 * cerrarSesion — revoca la sesión actual: borra la fila de `sessions`,
 * elimina la cookie y vuelve al login.
 */
export async function cerrarSesion(): Promise<void> {
  // Mismo predicado esSeguro que crearSesion: el nombre debe coincidir.
  const nombreCookie = esSeguro
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  const cookieStore = await cookies();
  const token = cookieStore.get(nombreCookie)?.value;

  if (token) {
    // Revocación real: sin fila en sessions, el token deja de valer aunque
    // alguien conserve la cookie.
    await db.delete(sessions).where(eq(sessions.sessionToken, token));
  }
  cookieStore.delete(nombreCookie);

  redirect("/auth/login");
}

// Fin de auth-actions.ts
