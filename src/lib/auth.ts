// auth.ts — configuración central de Auth.js v5 para Ágora (STUB).
// Providers: Google OAuth + Email (OTP por correo). Adaptador: Drizzle.
// Restringe el acceso a los dominios de correo permitidos de la comunidad.

// TODO: descomentar estos imports cuando existan los paquetes/módulos reales.
// import NextAuth from "next-auth";
// import Google from "next-auth/providers/google";
// import Email from "next-auth/providers/nodemailer"; // OTP por correo
// import { DrizzleAdapter } from "@auth/drizzle-adapter";
// import { db } from "@/server/db";
// import { sendEmail } from "@/lib/notifications";

/**
 * Dominios de correo permitidos para la comunidad cerrada.
 * TODO: mover a variable de entorno ALLOWED_EMAIL_DOMAINS (lista separada por comas).
 */
export const ALLOWED_EMAIL_DOMAINS: string[] = (
  process.env.ALLOWED_EMAIL_DOMAINS ?? "alumnos.universidad.mx,universidad.mx"
)
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

/**
 * isEmailDomainAllowed — valida que el dominio del correo pertenezca a la comunidad.
 * TODO: contemplar subdominios y normalización de alias (+).
 */
export function isEmailDomainAllowed(email?: string | null): boolean {
  // TODO: implementar validación real del dominio contra ALLOWED_EMAIL_DOMAINS.
  if (!email) return false;
  const dominio = email.split("@")[1]?.toLowerCase();
  return !!dominio && ALLOWED_EMAIL_DOMAINS.includes(dominio);
}

/**
 * Configuración de NextAuth v5 (STUB).
 * TODO: completar providers, adaptador, páginas, sesión y secret.
 */
// export const { handlers, auth, signIn, signOut } = NextAuth({
//   adapter: DrizzleAdapter(db),
//   session: { strategy: "database" }, // TODO: definir estrategia definitiva
//   providers: [
//     Google({
//       clientId: process.env.GOOGLE_CLIENT_ID,
//       clientSecret: process.env.GOOGLE_CLIENT_SECRET,
//     }),
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
