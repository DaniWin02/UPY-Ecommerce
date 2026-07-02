// Códec del carrito firmado — Fase 4.
//
// Decisión de diseño: el carrito NO vive en BD; viaja en una cookie firmada
// con HMAC-SHA256 y se re-valida contra el catálogo en cada lectura (cart.ts).
//
// Módulo PURO: solo depende de node:crypto, así que se testea en aislamiento
// sin arrancar Next (ver tests/unit/cart-codec.test.ts).
import { createHmac, timingSafeEqual } from "node:crypto";

// Un renglón del carrito: variante (SKU) + cantidad deseada.
export type CartItem = { variantId: string; qty: number };

// Límites defensivos: la cookie viene del navegador y NO es de fiar aunque la
// firma sea nuestra (podría ser una versión vieja pero válida, o basura).
const QTY_MAX = 9; // cantidad máxima por variante
const MAX_ITEMS = 30; // variantes distintas máximas en un carrito

// UUID en formato canónico (cualquier versión: los ids salen de defaultRandom()).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * normalizarItems — sanea una entrada desconocida hacia CartItem[] seguro.
 *
 * - Solo acepta arrays; cualquier otra cosa → [].
 * - Cada elemento debe ser { variantId: uuid válido, qty: entero 1..9 };
 *   lo que no cumpla (qty 0/negativa/decimal/>9, id no-uuid…) se descarta.
 * - Deduplica por variantId SUMANDO qty, con tope 9.
 * - Recorta a un máximo de 30 variantes distintas.
 */
export function normalizarItems(input: unknown): CartItem[] {
  if (!Array.isArray(input)) return [];

  // Map conserva el orden de inserción: el carrito mantiene el orden original.
  const porVariante = new Map<string, number>();

  for (const candidato of input) {
    if (typeof candidato !== "object" || candidato === null) continue;
    const { variantId, qty } = candidato as Record<string, unknown>;

    if (typeof variantId !== "string" || !UUID_RE.test(variantId)) continue;
    if (
      typeof qty !== "number" ||
      !Number.isInteger(qty) ||
      qty < 1 ||
      qty > QTY_MAX
    ) {
      continue;
    }

    const acumulado = porVariante.get(variantId);
    if (acumulado !== undefined) {
      // Duplicado: suma cantidades con tope 9.
      porVariante.set(variantId, Math.min(acumulado + qty, QTY_MAX));
    } else if (porVariante.size < MAX_ITEMS) {
      porVariante.set(variantId, qty);
    }
    // Si ya hay 30 variantes distintas, los ids nuevos se descartan (recorte).
  }

  return [...porVariante].map(([variantId, qty]) => ({ variantId, qty }));
}

// HMAC-SHA256 en hex del payload base64url. Interno al códec.
function calcularFirma(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * firmarCarrito — serializa y firma: base64url(JSON) + "." + HMAC hex.
 *
 * La serialización es canónica (solo los campos esperados, en orden fijo),
 * así el mismo contenido lógico siempre produce la misma firma.
 */
export function firmarCarrito(items: CartItem[], secret: string): string {
  const payload = Buffer.from(
    JSON.stringify(items.map(({ variantId, qty }) => ({ variantId, qty })))
  ).toString("base64url");
  return `${payload}.${calcularFirma(payload, secret)}`;
}

/**
 * verificarCarrito — valida firma (timingSafeEqual) y estructura.
 *
 * Ante CUALQUIER problema (undefined, formato malo, firma inválida, base64 o
 * JSON rotos) devuelve [] y NUNCA lanza: un carrito corrupto simplemente se
 * trata como carrito vacío. Al resultado válido se le aplica normalizarItems.
 */
export function verificarCarrito(
  raw: string | undefined,
  secret: string
): CartItem[] {
  try {
    if (!raw) return [];

    // Formato esperado: exactamente "payload.firma" (base64url no lleva ".").
    const partes = raw.split(".");
    if (partes.length !== 2) return [];
    const [payload, firmaRecibida] = partes;

    // Comparación en tiempo constante; si los largos difieren ya es inválida
    // (timingSafeEqual lanza con buffers de distinto tamaño).
    const esperada = Buffer.from(calcularFirma(payload, secret), "hex");
    const recibida = Buffer.from(firmaRecibida, "hex");
    if (esperada.length !== recibida.length) return [];
    if (!timingSafeEqual(esperada, recibida)) return [];

    // Firma válida: decodifica y sanea igualmente (defensa en profundidad).
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return normalizarItems(JSON.parse(json));
  } catch {
    // JSON.parse u otra rareza: carrito vacío, jamás propagamos el error.
    return [];
  }
}

// Fin del códec del carrito.
