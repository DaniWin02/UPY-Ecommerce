// ip-rules-db.ts — reglas de IP persistidas en BD para el acceso ADMIN.
// SOLO runtime Node (usa "@/db"): el gate GLOBAL del middleware edge NO puede
// importar este módulo; ahí solo aplican IP_GATE_ENABLED / CAMPUS_CIDRS.
// Este módulo combina env + reglas de BD (scopes admin/global) para el candado
// del panel de administración.
import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { ipRules } from "@/db/schema/ip-rules";
import { ipEnCampus, ipInCidr } from "@/lib/ip-rules";

type ReglaIp = typeof ipRules.$inferSelect;

// ---------------------------------------------------------------------------
// Caché en memoria (module-level): el layout admin evalúa la IP en CADA
// request; sin caché cada navegación pegaría a la BD. TTL corto (60s) para
// que las mutaciones desde otras instancias converjan rápido; las mutaciones
// locales invalidan al instante vía __invalidarCacheReglas().
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60_000;

let cache: { t: number; reglas: ReglaIp[] } | null = null;

/** Invalida la caché de reglas. Llamar tras CUALQUIER mutación de ip_rules. */
export function __invalidarCacheReglas(): void {
  cache = null;
}

/** Devuelve las reglas (todas, activas e inactivas) usando la caché de 60s. */
async function reglasCacheadas(): Promise<ReglaIp[]> {
  const ahora = Date.now();
  if (cache && ahora - cache.t < CACHE_TTL_MS) return cache.reglas;

  const reglas = await db
    .select()
    .from(ipRules)
    .orderBy(asc(ipRules.scope), desc(ipRules.prioridad));

  cache = { t: ahora, reglas };
  return reglas;
}

/**
 * listarReglas — todas las reglas de IP ordenadas por scope y prioridad DESC.
 * Sirve tanto para la página de administración como para diagnósticos.
 */
export async function listarReglas(): Promise<ReglaIp[]> {
  return reglasCacheadas();
}

/**
 * ipPermitidaParaAdmin — evalúa el acceso ADMIN combinando env y BD.
 * Solo considera reglas ACTIVAS de scope "admin" o "global" (nunca "vendor").
 * Orden de decisión (documentado y determinista):
 *  1) DENY activo cuyo CIDR matchee (mayor prioridad primero) → false.
 *  2) ipEnCampus(ip) por env (CAMPUS_CIDRS)                   → true.
 *  3) ALLOW activo cuyo CIDR matchee                          → true.
 *  4) Ningún criterio aplica                                  → false.
 * ipInCidr nunca lanza: un CIDR corrupto en BD simplemente no matchea.
 */
export async function ipPermitidaParaAdmin(ip: string): Promise<boolean> {
  const aplicables = (await reglasCacheadas())
    .filter((r) => r.activo && (r.scope === "admin" || r.scope === "global"))
    // Mayor prioridad se evalúa antes (la caché viene ordenada por scope
    // primero, así que reordenamos por prioridad pura para la evaluación).
    .sort((a, b) => b.prioridad - a.prioridad);

  // 1) Cualquier DENY que matchee bloquea, sin importar el resto.
  for (const regla of aplicables) {
    if (regla.accion === "deny" && ipInCidr(ip, regla.cidr)) return false;
  }

  // 2) Red del campus por env: base histórica del candado ADMIN_SOLO_IP_CAMPUS.
  if (ipEnCampus(ip)) return true;

  // 3) ALLOW explícito de BD: excepciones fuera del campus (p. ej. VPN propia).
  for (const regla of aplicables) {
    if (regla.accion === "allow" && ipInCidr(ip, regla.cidr)) return true;
  }

  // 4) Default: cerrado.
  return false;
}

// Fin de ip-rules-db.ts
