// ip-rules.ts — reglas de filtrado por IP para el GATE GLOBAL de la comunidad cerrada (STUB).
// El gate sólo deja entrar IPs del campus cuando IP_GATE_ENABLED está activo.

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

/** Flag global del gate por IP (feature flag). */
export const IP_GATE_ENABLED: boolean = process.env.IP_GATE_ENABLED === "true";

/**
 * CIDRs del campus permitidos por defecto cuando el gate está activo.
 * TODO: leer de configuración/BD; admitir IPv6.
 */
export const CAMPUS_CIDRS: string[] = (process.env.CAMPUS_CIDRS ?? "")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

/**
 * ipInCidr — indica si una IP pertenece a un rango CIDR.
 * TODO: implementar el cálculo real (IPv4 e IPv6) comparando bits de red.
 */
export function ipInCidr(_ip: string, _cidr: string): boolean {
  // TODO: parsear IP y CIDR, aplicar máscara y comparar la parte de red.
  return false;
}

/**
 * isIpAllowed — decide si una IP puede acceder a un ámbito dado.
 * Considera IP_GATE_ENABLED y CAMPUS_CIDRS (y reglas específicas a futuro).
 * TODO: cargar reglas IpRule de BD, ordenarlas por prioridad y resolver allow/deny.
 */
export async function isIpAllowed(ip: string, scope: IpScope): Promise<boolean> {
  // TODO: si el gate está apagado, permitir todo.
  if (!IP_GATE_ENABLED) return true;

  // TODO: evaluar reglas IpRule específicas del `scope` antes que el default del campus.
  void scope;

  // TODO: por defecto, permitir sólo si la IP cae en algún CIDR del campus.
  return CAMPUS_CIDRS.some((cidr) => ipInCidr(ip, cidr));
}

// Fin de ip-rules.ts
