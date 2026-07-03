// rate-limit.ts — limitador de intentos compartido (Fase 8, hardening).
//
// Sliding window EN MEMORIA por proceso: suficiente para el MVP self-host de
// un solo proceso; en V1 migrar a Redis (o a una tabla) si hay varias réplicas,
// porque cada proceso tendría su propio Map y los límites se multiplicarían.
//
// Extraído del limitador embebido de auth-actions.ts para reutilizarlo en
// checkout, subida de comprobantes, ingesta de analítica y mensajería.
// Sin dependencias: la parte pura (permitirIntento) es testeable en aislamiento.

// Map de clave → timestamps (ms) de intentos DENTRO de la ventana.
const intentos = new Map<string, number[]>();

// Poda global: si el Map supera este número de claves, se eliminan las
// vencidas para evitar crecimiento sin límite (claves de un solo uso que
// nadie vuelve a consultar jamás se podarían con la poda por-clave).
const MAX_CLAVES = 10_000;

// Ventana más grande vista hasta ahora: como el Map solo guarda timestamps
// (no la ventana de cada clave), la poda global usa esta cota CONSERVADORA:
// una clave se considera vencida si su intento más reciente es más viejo que
// la mayor ventana en uso. Puede retener claves de ventanas cortas un poco
// más de la cuenta, pero JAMÁS borra una clave aún activa.
let ventanaMaxVista = 0;

/** Elimina las claves cuyo último intento quedó fuera de toda ventana posible. */
function podaGlobal(ahora: number): void {
  for (const [clave, timestamps] of intentos) {
    const ultimo = timestamps[timestamps.length - 1] ?? 0;
    if (ahora - ultimo >= ventanaMaxVista) {
      intentos.delete(clave); // borrar durante la iteración de un Map es seguro
    }
  }
}

/**
 * permitirIntento — true si la clave aún tiene cupo dentro de la ventana.
 *
 * Registra el intento SOLO cuando se permite (los intentos bloqueados no
 * alargan el castigo — mismo comportamiento que el limitador original de
 * auth-actions). Poda los timestamps viejos de la clave en cada consulta.
 */
export function permitirIntento(
  clave: string,
  max: number,
  ventanaMs: number
): boolean {
  const ahora = Date.now();
  if (ventanaMs > ventanaMaxVista) ventanaMaxVista = ventanaMs;
  if (intentos.size > MAX_CLAVES) podaGlobal(ahora);

  const recientes = (intentos.get(clave) ?? []).filter(
    (t) => ahora - t < ventanaMs
  );
  if (recientes.length >= max) {
    intentos.set(clave, recientes);
    return false;
  }
  recientes.push(ahora);
  intentos.set(clave, recientes);
  return true;
}

/** Limpia TODO el estado del limitador. Solo para tests. */
export function __resetParaTests(): void {
  intentos.clear();
  ventanaMaxVista = 0;
}

/**
 * claveConIp — compone `${prefijo}:${ip}` con la primera IP de
 * x-forwarded-for del request actual (server actions / route handlers).
 *
 * La IP solo sirve para DIFERENCIAR clientes detrás del mismo prefijo; un
 * atacante puede falsearla si llega directo al proceso, así que NO es
 * seguridad dura — el límite por usuario/email sigue siendo el principal.
 */
export async function claveConIp(prefijo: string): Promise<string> {
  // Import perezoso: mantiene permitirIntento importable en tests unitarios
  // sin arrastrar next/headers (que solo funciona dentro de un request).
  const { headers } = await import("next/headers");
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return `${prefijo}:${ip}`;
}

// Fin de rate-limit.ts
