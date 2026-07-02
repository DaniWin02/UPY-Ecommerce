// auth.ts — configuración central de Auth.js v5 para Ágora (STUB).
// Providers: Google OAuth + Email (OTP por correo). Adaptador: Drizzle.
// Restringe el acceso a los dominios de correo permitidos de la comunidad.

// TODO (Fase 2): descomentar estos imports al activar NextAuth.
// import NextAuth from "next-auth";
// import Google from "next-auth/providers/google";
// import Resend from "next-auth/providers/resend"; // magic link (usa RESEND_API_KEY)
// import { DrizzleAdapter } from "@auth/drizzle-adapter";
// import { db } from "@/db";
// import { users, accounts, sessions, verificationTokens } from "@/db/schema";

/**
 * Dominios de correo permitidos para la comunidad cerrada.
 * Se leen de ALLOWED_EMAIL_DOMAINS (lista separada por comas).
 * Normalización: trim + lowercase + se QUITA el prefijo "@" si viene
 * (el .env puede traer "@uni.mx" o "uni.mx"; la comparación se hace
 * contra email.split("@")[1], que nunca incluye la arroba).
 */
export const ALLOWED_EMAIL_DOMAINS: string[] = (
  process.env.ALLOWED_EMAIL_DOMAINS ?? "alumno.upy.edu.mx,upy.edu.mx"
)
  .split(",")
  .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);

/**
 * isEmailDomainAllowed — valida que el dominio del correo pertenezca a la comunidad.
 * Devuelve false si el email es null/undefined, vacío o no contiene "@".
 * La comparación es EXACTA contra los dominios ya normalizados (sin subdominios).
 */
export function isEmailDomainAllowed(email?: string | null): boolean {
  if (!email) return false;
  // lastIndexOf y no split: "a@upy.edu.mx@evil.com" debe validar contra
  // "evil.com" (el dominio real), no contra el segmento intermedio.
  const arroba = email.lastIndexOf("@");
  if (arroba < 0) return false;
  const dominio = email.slice(arroba + 1).trim().toLowerCase();
  return !!dominio && ALLOWED_EMAIL_DOMAINS.includes(dominio);
}

/**
 * Configuración de NextAuth v5 (STUB).
 * TODO: completar providers, adaptador, páginas, sesión y secret.
 */
// export const { handlers, auth, signIn, signOut } = NextAuth({
//   // OJO: el mapeo de tablas es OBLIGATORIO — nuestros nombres (users, accounts,
//   // sessions, verificationTokens) difieren de los defaults del adaptador.
//   adapter: DrizzleAdapter(db, {
//     usersTable: users,
//     accountsTable: accounts,
//     sessionsTable: sessions,
//     verificationTokensTable: verificationTokens,
//   }),
//   session: { strategy: "database" }, // revocable — comunidad cerrada
//   providers: [
//     // Sin argumentos: Auth.js v5 autodetecta AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET.
//     Google,
//     Email({
//       // TODO: configurar envío de OTP por correo usando Resend (sendEmail).
//       maxAge: 10 * 60, // 10 min de validez del código
//       sendVerificationRequest: async ({ identifier, url }) => {
//         // TODO: enviar código/enlace OTP al correo `identifier`.
//       },
//     }),
//   ],
//   pages: {
//     signIn: "/auth", // TODO: ruta real de inicio de sesión
//   },
//   callbacks: {
//     // signIn — restringe el acceso a los dominios de la comunidad.
//     async signIn({ user }) {
//       // TODO: registrar intento y motivo de rechazo.
//       return isEmailDomainAllowed(user?.email);
//     },
//   },
// });

// --- Exports temporales (STUB) para que el esqueleto compile sin el paquete real ---
// TODO: ELIMINAR este bloque cuando se active el NextAuth() de arriba.
export const handlers = {
  // TODO: reemplazar por los handlers reales (GET/POST) de Auth.js v5.
  GET: async () => new Response("auth handler stub", { status: 501 }),
  POST: async () => new Response("auth handler stub", { status: 501 }),
};

export async function auth(): Promise<unknown> {
  // TODO: devolver la sesión real del usuario autenticado.
  return null;
}

export async function signIn(..._args: unknown[]): Promise<void> {
  // TODO: delegar al signIn real de Auth.js v5.
}

export async function signOut(..._args: unknown[]): Promise<void> {
  // TODO: delegar al signOut real de Auth.js v5.
}

// Fin de auth.ts
