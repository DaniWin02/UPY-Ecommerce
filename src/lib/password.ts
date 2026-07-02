// password.ts — hasheo y verificación de contraseñas con scrypt (node:crypto).
// Módulo PURO: sin dependencias de Next.js ni de la base de datos, para que
// sea testeable en aislamiento con Vitest.
//
// Formato de almacenamiento: "scrypt$<saltHex>$<hashHex>"
//   - algoritmo explícito al inicio → permite migrar a otro (argon2…) sin
//     romper las filas existentes.
//   - salt aleatorio de 16 bytes por password → dos hashes del mismo password
//     siempre difieren.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Parámetros de scrypt (coste estándar recomendado por OWASP para scrypt):
// N = 2^14 iteraciones, r = 8 (bloque), p = 1 (paralelismo), 64 bytes de clave.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

/** Envuelve scrypt (callback) en una Promise con los parámetros fijos del módulo. */
function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEYLEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (err, derivedKey) => (err ? reject(err) : resolve(derivedKey))
    );
  });
}

/**
 * hashPassword — deriva un hash scrypt con salt aleatorio de 16 bytes.
 * Devuelve el string autocontenido "scrypt$<saltHex>$<hashHex>" listo para
 * guardarse en users.password_hash.
 */
export async function hashPassword(password: string): Promise<string> {
  // Defensa en profundidad: los callers ya validan la longitud antes, pero si
  // alguno se lo salta, mejor fallar aquí que derivar scrypt de una entrada
  // gigante (DoS por CPU).
  if (password.length > 128) {
    throw new Error("password demasiado larga");
  }
  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(password, salt);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * verifyPassword — comprueba una password contra el valor almacenado.
 *
 * NUNCA lanza: ante stored null/undefined/vacío/malformado devuelve false
 * (así el caller puede usar el mismo camino de "credenciales inválidas" sin
 * try/catch). La comparación usa timingSafeEqual para no filtrar información
 * por tiempo de respuesta.
 */
export async function verifyPassword(
  password: string,
  stored: string | null | undefined
): Promise<boolean> {
  try {
    if (!stored) return false;

    const [algoritmo, saltHex, hashHex] = stored.split("$");
    if (algoritmo !== "scrypt" || !saltHex || !hashHex) return false;

    const salt = Buffer.from(saltHex, "hex");
    const esperado = Buffer.from(hashHex, "hex");
    // Un hex corrupto o de longitud incorrecta no puede coincidir jamás.
    if (salt.length !== SALT_BYTES || esperado.length !== KEYLEN) return false;

    const calculado = await scryptAsync(password, salt);
    // timingSafeEqual exige buffers de igual longitud (ya garantizado arriba).
    return timingSafeEqual(calculado, esperado);
  } catch {
    // Cualquier error inesperado (hex inválido, fallo de scrypt…) → false.
    return false;
  }
}

// Fin de password.ts
