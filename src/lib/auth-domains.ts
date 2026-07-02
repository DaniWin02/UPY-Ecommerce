// auth-domains.ts — validación de dominios de correo de la comunidad cerrada.
// Módulo PURO: sin imports de next-auth ni de la base de datos, para que sea
// testeable en aislamiento (p. ej. con vi.stubEnv en Vitest).

/**
 * allowedEmailDomains — dominios de correo permitidos para la comunidad.
 *
 * Lee ALLOWED_EMAIL_DOMAINS de process.env EN CADA LLAMADA (no como const de
 * módulo) para que los tests puedan stubear la variable y para que un cambio
 * de entorno no requiera reiniciar el proceso por caché de módulo.
 *
 * Normalización de cada entrada: trim + lowercase + se QUITA el prefijo "@"
 * si viene (el .env puede traer "@uni.mx" o "uni.mx"; la comparación se hace
 * contra la parte del email después de la arroba, que nunca la incluye).
 */
export function allowedEmailDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? "alumno.upy.edu.mx,upy.edu.mx")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

/**
 * isEmailDomainAllowed — valida que el dominio del correo pertenezca a la comunidad.
 *
 * Devuelve false si el email es null/undefined, vacío o no contiene "@".
 * La comparación es EXACTA contra los dominios ya normalizados (sin subdominios).
 */
export function isEmailDomainAllowed(email?: string | null): boolean {
  if (!email) return false;
  // lastIndexOf y no split: un email malicioso "a@upy.edu.mx@evil.com" debe
  // validar contra "evil.com" (el dominio real), no contra el segmento intermedio.
  const arroba = email.lastIndexOf("@");
  if (arroba < 0) return false;
  const dominio = email.slice(arroba + 1).trim().toLowerCase();
  return !!dominio && allowedEmailDomains().includes(dominio);
}

// Fin de auth-domains.ts
