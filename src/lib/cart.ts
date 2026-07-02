// Carrito del lado servidor — Fase 4 (núcleo).
//
// El carrito NO vive en BD: es una cookie firmada (ver cart-codec.ts) que se
// re-valida contra el catálogo en cada lectura. Este módulo aporta las dos
// mitades: la cookie (leer/escribir) y la resolución multivendedor contra BD.
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { inventory, products, productVariants, vendors } from "@/db/schema";
import {
  firmarCarrito,
  normalizarItems,
  verificarCarrito,
  type CartItem,
} from "./cart-codec";

// Re-export por comodidad de páginas y actions.
export type { CartItem } from "./cart-codec";

export const NOMBRE_COOKIE_CARRITO = "agora_carrito";

// Secreto de firma del carrito. AUTH_SECRET existe SIEMPRE en despliegues
// reales (Auth.js lo exige para arrancar); el fallback solo cubre desarrollo
// local sin .env y deja claro en el nombre que hay que cambiarlo.
function secreto(): string {
  return process.env.AUTH_SECRET ?? "dev-secret-cambiame";
}

// Flag de cookie segura: MISMO predicado https que src/lib/auth-actions.ts
// (se deduce de la URL pública de la app o de NODE_ENV=production) para que
// el comportamiento de todas nuestras cookies sea coherente entre entornos.
const esSeguro =
  (process.env.AUTH_URL ?? process.env.APP_URL ?? "").startsWith("https") ||
  process.env.NODE_ENV === "production";

// Vida de la cookie del carrito: 30 días (en segundos, como pide maxAge).
const TREINTA_DIAS_S = 30 * 24 * 60 * 60;

/**
 * leerCarrito — lee y verifica la cookie firmada. Cookie ausente, corrupta o
 * con firma inválida ⇒ carrito vacío (verificarCarrito nunca lanza).
 */
export async function leerCarrito(): Promise<CartItem[]> {
  // Import dinámico de next/headers: mantiene este módulo importable desde
  // Vitest (los tests de integración usan resolverCarrito) sin cargar Next.
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const raw = cookieStore.get(NOMBRE_COOKIE_CARRITO)?.value;
  return verificarCarrito(raw, secreto());
}

/**
 * escribirCarrito — normaliza, firma y persiste el carrito en la cookie.
 * httpOnly: el cliente no lee ni escribe el carrito por JS, solo vía actions.
 */
export async function escribirCarrito(items: CartItem[]): Promise<void> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const valor = firmarCarrito(normalizarItems(items), secreto());
  cookieStore.set(NOMBRE_COOKIE_CARRITO, valor, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: esSeguro,
    maxAge: TREINTA_DIAS_S,
  });
}

/** contarItems — total de unidades del carrito (suma de qty). */
export function contarItems(items: CartItem[]): number {
  return items.reduce((suma, item) => suma + item.qty, 0);
}

// ---------------------------------------------------------------------------
// Resolución del carrito contra la BD (fuente de verdad de precios y stock).
// ---------------------------------------------------------------------------

// Una línea resuelta: la variante con sus datos frescos de catálogo.
export type LineaCarrito = {
  variantId: string;
  productId: string;
  nombre: string;
  atributos: { talla?: string; color?: string } | null;
  imagenUrl: string | null;
  precioUnit: string;
  disponible: number;
  qty: number;
  subtotal: string;
};

// Grupo por vendedor: el checkout es por vendor (multivendedor, SPEI directo).
export type GrupoCarrito = {
  vendor: {
    id: string;
    slug: string;
    nombre: string;
    aulaDefault: string | null;
  };
  lineas: LineaCarrito[];
  subtotal: string;
};

export type CarritoResuelto = {
  grupos: GrupoCarrito[];
  total: string;
  totalItems: number;
  descartados: number;
};

// Formatea centavos enteros de vuelta a string "123.45" (2 decimales fijos).
function centavosAString(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

/**
 * resolverCarrito — cruza los CartItem de la cookie contra el catálogo real.
 *
 * - JOIN variantes → products (estado "activo") → vendors (estado "activo"),
 *   más LEFT JOIN a inventory (una variante sin fila de inventario cuenta
 *   como sin stock, no como error).
 * - Cualquier variantId inexistente o cuyo producto/vendor no esté activo se
 *   DESCARTA y se contabiliza en `descartados` (la página puede avisar).
 * - precioUnit = precioComunidad ?? precio (precio de comunidad manda).
 * - disponible = max(stock - reservado, 0). qty NO se recorta aquí: la página
 *   del carrito avisa cuando qty > disponible.
 * - Dinero: subtotales y total se calculan en CENTAVOS con enteros
 *   (Math.round(Number(precio) * 100)) para evitar errores de flotantes,
 *   y se formatean de vuelta a string "123.45".
 * - Agrupa por vendor, con los grupos ordenados por nombre del vendor.
 */
export async function resolverCarrito(
  items: CartItem[]
): Promise<CarritoResuelto> {
  if (items.length === 0) {
    return { grupos: [], total: "0.00", totalItems: 0, descartados: 0 };
  }

  const ids = items.map((item) => item.variantId);
  const filas = await db
    .select({
      variantId: productVariants.id,
      atributos: productVariants.atributos,
      precio: productVariants.precio,
      precioComunidad: productVariants.precioComunidad,
      productId: products.id,
      nombre: products.nombre,
      imagenes: products.imagenes,
      stock: inventory.stock,
      reservado: inventory.reservado,
      vendorId: vendors.id,
      vendorSlug: vendors.slug,
      vendorNombre: vendors.nombre,
      aulaDefault: vendors.aulaDefault,
    })
    .from(productVariants)
    // Los estados activos van en el ON del JOIN: producto o vendor inactivos
    // simplemente no casan y la variante queda fuera (→ descartada).
    .innerJoin(
      products,
      and(
        eq(products.id, productVariants.productId),
        eq(products.estado, "activo")
      )
    )
    .innerJoin(
      vendors,
      and(eq(vendors.id, products.vendorId), eq(vendors.estado, "activo"))
    )
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(inArray(productVariants.id, ids));

  const porVariante = new Map(filas.map((fila) => [fila.variantId, fila]));

  // Acumuladores por vendor (subtotal en centavos hasta el final).
  type GrupoAcumulado = {
    vendor: GrupoCarrito["vendor"];
    lineas: LineaCarrito[];
    subtotalCentavos: number;
  };
  const gruposPorVendor = new Map<string, GrupoAcumulado>();

  let totalCentavos = 0;
  let totalItems = 0;
  let descartados = 0;

  for (const item of items) {
    const fila = porVariante.get(item.variantId);
    if (!fila) {
      // Inexistente, o producto/vendor no activo: fuera del carrito resuelto.
      descartados += 1;
      continue;
    }

    // Precio de comunidad si existe; si no, precio público (numeric → string).
    const precioUnit = fila.precioComunidad ?? fila.precio;
    const precioCentavos = Math.round(Number(precioUnit) * 100);
    const subtotalCentavos = precioCentavos * item.qty;

    // Sin fila de inventario (LEFT JOIN nulo) se trata como stock 0.
    const disponible = Math.max((fila.stock ?? 0) - (fila.reservado ?? 0), 0);

    // atributos es jsonb libre; el carrito solo muestra talla/color. Un objeto
    // vacío se normaliza a null para que la UI no pinte nada.
    const atributosCrudos = fila.atributos as
      | { talla?: string; color?: string }
      | null;
    const atributos =
      atributosCrudos && Object.keys(atributosCrudos).length > 0
        ? atributosCrudos
        : null;

    const linea: LineaCarrito = {
      variantId: fila.variantId,
      productId: fila.productId,
      nombre: fila.nombre,
      atributos,
      imagenUrl: fila.imagenes[0] ?? null,
      precioUnit,
      disponible,
      qty: item.qty, // no se recorta aquí (la página avisa si qty > disponible)
      subtotal: centavosAString(subtotalCentavos),
    };

    let grupo = gruposPorVendor.get(fila.vendorId);
    if (!grupo) {
      grupo = {
        vendor: {
          id: fila.vendorId,
          slug: fila.vendorSlug,
          nombre: fila.vendorNombre,
          aulaDefault: fila.aulaDefault,
        },
        lineas: [],
        subtotalCentavos: 0,
      };
      gruposPorVendor.set(fila.vendorId, grupo);
    }
    grupo.lineas.push(linea);
    grupo.subtotalCentavos += subtotalCentavos;

    totalCentavos += subtotalCentavos;
    totalItems += item.qty;
  }

  // Grupos ordenados por nombre del vendor (orden estable para la UI).
  const grupos: GrupoCarrito[] = [...gruposPorVendor.values()]
    .sort((a, b) => a.vendor.nombre.localeCompare(b.vendor.nombre, "es"))
    .map(({ vendor, lineas, subtotalCentavos }) => ({
      vendor,
      lineas,
      subtotal: centavosAString(subtotalCentavos),
    }));

  return {
    grupos,
    total: centavosAString(totalCentavos),
    totalItems,
    descartados,
  };
}

// Fin del carrito del lado servidor.
