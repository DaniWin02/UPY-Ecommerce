// ip-rules.ts — reglas de filtrado por IP para el GATE GLOBAL de la comunidad cerrada.
// El gate sólo deja entrar IPs del campus cuando IP_GATE_ENABLED está activo.
// IMPORTANTE: este módulo corre en edge runtime — sólo cómputo puro y process.env
// (nada de imports de Node como "net"/"fs" ni acceso a la BD).
// NOTA: NO exportamos constantes evaluadas a nivel de módulo desde env
// (p. ej. `export const IP_GATE_ENABLED = ...`) porque congelan el valor al
// importar y rompen la testeabilidad con vi.stubEnv. Se lee env en cada llamada.

/** Ámbito al que aplica una regla de IP. */
export type IpScope = "global" | "admin" | "vendor";

/** Acción de la regla. */
export type IpAction = "allow" | "deny";

/**
 * IpRule — regla individual de control de acceso por IP.
 * Se evalúan por `prioridad` (mayor prioridad gana en caso de empate de match).
 */
export type IpRule = {
  /** Rango en notación CIDR, p. ej. "10.0.0.0/24". */
  cidr: string;
  /** Acción a aplicar si la IP cae dentro del CIDR. */
  accion: IpAction;
  /** Ámbito donde aplica la regla. */
  scope: IpScope;
  /** Prioridad de evaluación (mayor = se evalúa antes). */
  prioridad: number;
};

/**
 * parseIpv4 — convierte una IPv4 "a.b.c.d" a uint32, o null si es inválida.
 * Acepta IPv6-mapeadas "::ffff:a.b.c.d" quitando el prefijo (case-insensitive).
 * Rechaza octetos fuera de 0..255, cantidad de octetos distinta de 4,
 * octetos vacíos/no numéricos e IPv6 real. Nunca lanza excepciones.
 */
function parseIpv4(ip: string): number | null {
  if (typeof ip !== "string") return null;

  let limpia = ip.trim();

  // IPv6-mapeada: "::ffff:a.b.c.d" → nos quedamos con la parte IPv4.
  const prefijoMapeada = /^::ffff:/i;
  if (prefijoMapeada.test(limpia)) {
    limpia = limpia.replace(prefijoMapeada, "");
  }

  // Si aún contiene ":" es IPv6 real (u otra basura) → inválida.
  if (limpia.includes(":")) return null;

  const octetos = limpia.split(".");
  if (octetos.length !== 4) return null;

  let valor = 0;
  for (const octeto of octetos) {
    // Sólo dígitos SIN ceros a la izquierda (rechaza vacíos, signos, hex y
    // "010": en notación inet_aton clásica sería octal y aquí sería ambiguo).
    if (!/^(0|[1-9]\d{0,2})$/.test(octeto)) return null;
    const n = Number(octeto);
    if (n > 255) return null;
    // Desplazamos con >>> 0 para mantener el resultado como uint32
    // (el << de JS opera en int32 con signo y podría dar negativos).
    valor = ((valor << 8) >>> 0) + n;
  }
  return valor >>> 0;
}

/**
 * ipInCidr — indica si una IPv4 pertenece a un rango CIDR (IPv4 puro).
 * Soporta "a.b.c.d/n" con n en 0..32 y también una IP suelta sin "/n"
 * (equivale a /32). Acepta IPv6-mapeadas "::ffff:a.b.c.d" en ambos lados.
 * Devuelve false ante CUALQUIER entrada inválida (octetos >255, máscara
 * fuera de rango, basura, IPv6 real). Nunca lanza excepciones.
 */
export function ipInCidr(ip: string, cidr: string): boolean {
  if (typeof cidr !== "string") return false;

  const ipNum = parseIpv4(ip);
  if (ipNum === null) return false;

  const partes = cidr.trim().split("/");
  // Más de un "/" (p. ej. "10.0.0.0/8/8") → inválido.
  if (partes.length > 2) return false;

  const baseNum = parseIpv4(partes[0]);
  if (baseNum === null) return false;

  let bits = 32; // IP suelta sin "/n" equivale a /32.
  if (partes.length === 2) {
    // Sólo dígitos SIN cero a la izquierda (rechaza "/-1", "/8.5", "/abc",
    // "/" vacío y "/00": un typo "/00" se interpretaría como /0 = permitir TODO).
    if (!/^(0|[1-9]\d?)$/.test(partes[1])) return false;
    bits = Number(partes[1]);
    if (bits > 32) return false;
  }

  // Máscara /0 = todo pasa. Ojo: (x << 32) en JS NO es 0 (el shift es módulo
  // 32), por eso el caso 0 se maneja aparte antes de construir la máscara.
  if (bits === 0) return true;

  // Máscara de red como uint32: n bits altos en 1.
  const mascara = (0xffffffff << (32 - bits)) >>> 0;

  return ((ipNum & mascara) >>> 0) === ((baseNum & mascara) >>> 0);
}

/**
 * extraerIpCliente — extrae la IP real del cliente de una cadena x-forwarded-for.
 * PURA salvo por sus argumentos: no lee env (el llamador pasa `confianza`).
 *
 * `confianza` = nº de proxies PROPIOS delante de la app (env TRUSTED_PROXIES).
 * XFF = "cliente, proxy1, proxy2, ...": cada salto añade a la DERECHA la IP de
 * su peer, así que los últimos `confianza` valores los pusieron NUESTROS
 * proxies y son fiables. La IP del cliente se toma desde la derecha saltando
 * `confianza` entradas (índice longitud - confianza - 1).
 *
 * Con confianza = 0 se toma la ÚLTIMA: la puso el peer TCP directo y no es
 * falsificable por el cliente cuando el server está expuesto directo o la
 * plataforma SOBRESCRIBE la cabecera (Vercel lo hace).
 *
 * Comportamiento elegido en los bordes (documentado y testeado):
 *  - Entradas vacías / espacios se limpian antes de indexar.
 *  - Si `confianza` >= nº de entradas (índice negativo: el cliente no envió
 *    XFF y toda la cadena la pusieron nuestros proxies) → se devuelve la más
 *    a la IZQUIERDA disponible, que es la más cercana al cliente real.
 *  - Si `confianza` es negativa o no numérica (NaN) → se sanea a 0, es decir,
 *    cae a la más a la DERECHA (la opción no falsificable).
 *  - Cadena vacía, null/undefined o solo separadores → null.
 */
export function extraerIpCliente(
  xff: string | null | undefined,
  confianza: number
): string | null {
  if (!xff) return null;

  // Limpieza: separar por comas, trim y descartar entradas vacías.
  const saltos = xff
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (saltos.length === 0) return null;

  // Sanear confianza: NaN / negativos / decimales → entero >= 0.
  const n =
    Number.isFinite(confianza) && confianza > 0 ? Math.floor(confianza) : 0;

  // Desde la derecha, saltando las `n` entradas puestas por nuestros proxies.
  // Índice negativo (confianza >= longitud) → clamp a 0 (la más a la izquierda).
  const idx = saltos.length - 1 - n;
  return saltos[Math.max(idx, 0)];
}

/**
 * ipEnCampus — indica si una IP cae en algún CIDR de CAMPUS_CIDRS,
 * SIN considerar el flag IP_GATE_ENABLED (a diferencia de isIpAllowed, que
 * con el gate APAGADO devuelve true para todo). Útil para checks que deben
 * exigir la red del campus aunque el gate global esté apagado, p. ej. el
 * candado ADMIN_SOLO_IP_CAMPUS del panel admin.
 * Lee process.env.CAMPUS_CIDRS EN CADA LLAMADA (testeable con vi.stubEnv).
 */
export function ipEnCampus(ip: string): boolean {
  // Lista de CIDRs del campus: separada por comas, trim, ignora vacíos.
  const campusCidrs = (process.env.CAMPUS_CIDRS ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  return campusCidrs.some((cidr) => ipInCidr(ip, cidr));
}

/**
 * isIpAllowed — decide si una IP puede acceder a un ámbito dado.
 * Lee process.env EN CADA LLAMADA (testeable con vi.stubEnv):
 *  - Si process.env.IP_GATE_ENABLED !== "true" → true (gate apagado, todo pasa).
 *  - Si está activo → true sólo si la IP cae en ALGÚN CIDR de
 *    process.env.CAMPUS_CIDRS (lista separada por comas; se hace trim y se
 *    ignoran las entradas vacías).
 *
 * El parámetro `scope` queda RESERVADO para las reglas IpRule persistidas en
 * BD (V1): permitirá aplicar allow/deny específicos por ámbito ("admin",
 * "vendor") con prioridades, antes del default del campus. Hoy no altera el
 * resultado. La función es async para no romper la firma cuando esa consulta
 * a BD exista.
 */
export async function isIpAllowed(ip: string, scope: IpScope): Promise<boolean> {
  // Gate apagado → todo pasa. Se lee env aquí (no a nivel de módulo).
  if (process.env.IP_GATE_ENABLED !== "true") return true;

  // Reservado para V1: evaluar reglas IpRule del `scope` antes del default.
  void scope;

  // Default del gate encendido: pertenecer a la red del campus.
  return ipEnCampus(ip);
}

// Fin de ip-rules.ts
