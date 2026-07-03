// referencia.ts — generación y validación de la referencia de pago SPEI.
//
// Módulo PURO (sin dependencias, sin BD): testeable en aislamiento.
// Formato: AG-XXXXXX-DD
//   - "AG" = prefijo Ágora, separadores "-" fijos.
//   - XXXXXX = 6 caracteres del alfabeto Crockford base32 (SIN I, L, O, U:
//     evita ambigüedad al teclear la referencia en la app del banco).
//   - DD = checksum de 2 dígitos: suma de codepoints de los 6 chars % 97,
//     con relleno de cero a la izquierda ("07"). Detecta typos al capturar.

/** Alfabeto Crockford base32: 0-9 + A-Z sin I, L, O, U (32 símbolos). */
export const ALFABETO_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** Prefijo fijo de toda referencia de Ágora. */
const PREFIJO = "AG";

/** Longitud del cuerpo aleatorio de la referencia. */
const LARGO_CUERPO = 6;

// Regex del formato completo. El rango del cuerpo replica el alfabeto
// Crockford: 0-9, A-H, J, K, M, N, P-T, V-Z (sin I, L, O, U).
const FORMATO = /^AG-[0-9A-HJKMNP-TV-Z]{6}-\d{2}$/;

/**
 * checksum — suma de codepoints del cuerpo % 97, como string de 2 dígitos.
 * 97 es primo: reparte bien los valores y el resultado (0..96) siempre cabe
 * en dos dígitos con pad de cero.
 */
function checksum(cuerpo: string): string {
  let suma = 0;
  for (const ch of cuerpo) {
    suma += ch.codePointAt(0) ?? 0;
  }
  return String(suma % 97).padStart(2, "0");
}

/**
 * generarReferencia — produce una referencia "AG-XXXXXX-DD".
 *
 * @param aleatorio Fuente de aleatoriedad [0,1) inyectable para tests
 *                  deterministas; por defecto Math.random. La unicidad REAL
 *                  la garantiza el UNIQUE de BD (el caller reintenta en 23505).
 */
export function generarReferencia(aleatorio: () => number = Math.random): string {
  let cuerpo = "";
  for (let i = 0; i < LARGO_CUERPO; i++) {
    // Índice 0..31 sobre el alfabeto; clamp defensivo por si aleatorio() === 1.
    const idx = Math.min(
      Math.floor(aleatorio() * ALFABETO_CROCKFORD.length),
      ALFABETO_CROCKFORD.length - 1,
    );
    cuerpo += ALFABETO_CROCKFORD[idx];
  }
  return `${PREFIJO}-${cuerpo}-${checksum(cuerpo)}`;
}

/**
 * esReferenciaValida — valida formato Y checksum.
 *
 * DECISIÓN: la validación es ESTRICTA (no normaliza): minúsculas, espacios o
 * chars ambiguos (I/L/O/U) se rechazan. Si una capa superior quiere ser
 * tolerante, debe normalizar (trim + toUpperCase) ANTES de llamar aquí.
 */
export function esReferenciaValida(ref: string): boolean {
  if (typeof ref !== "string" || !FORMATO.test(ref)) return false;
  const cuerpo = ref.slice(3, 3 + LARGO_CUERPO); // "AG-".length === 3
  const digitos = ref.slice(-2);
  return checksum(cuerpo) === digitos;
}

// Fin de referencia.ts
