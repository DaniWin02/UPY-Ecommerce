"use server";
// Server Actions del carrito — Fase 4.
//
// El carrito vive en una cookie firmada (src/lib/cart.ts): estas actions son
// la ÚNICA vía de escritura. Toda entrada llega del cliente y se re-valida
// aquí; el estado real de precios y stock siempre se consulta en BD.
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { inventory, products, productVariants, vendors } from "@/db/schema";
import { escribirCarrito, leerCarrito } from "@/lib/cart";

// Mismos límites que el códec (cart-codec.ts): cantidad 1..9 por variante.
const QTY_MAX = 9;

// UUID canónico: valida el variantId antes de tocar la BD.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * agregarAlCarrito — agrega (o suma) una variante al carrito.
 *
 * Se invoca DESDE un client component con startTransition, por eso devuelve
 * un objeto { ok, mensaje } en lugar de redirigir: el botón muestra el
 * resultado (toast) sin salir de la página de producto.
 */
export async function agregarAlCarrito(
  variantId: string,
  qty: number = 1
): Promise<{ ok: boolean; mensaje: string }> {
  // 1) Validación de entrada (viene del cliente: no es de fiar).
  if (typeof variantId !== "string" || !UUID_RE.test(variantId)) {
    return { ok: false, mensaje: "Producto inválido" };
  }
  if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > QTY_MAX) {
    return { ok: false, mensaje: "La cantidad debe ser un entero entre 1 y 9" };
  }

  // 2) La variante debe existir con producto Y vendor ACTIVOS; el inventario
  //    entra por LEFT JOIN (sin fila de inventario = sin stock).
  const [fila] = await db
    .select({
      stock: inventory.stock,
      reservado: inventory.reservado,
    })
    .from(productVariants)
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
    .where(eq(productVariants.id, variantId))
    .limit(1);

  if (!fila) {
    return { ok: false, mensaje: "Este producto ya no está disponible" };
  }

  const disponible = Math.max((fila.stock ?? 0) - (fila.reservado ?? 0), 0);
  if (disponible <= 0) {
    return { ok: false, mensaje: "Producto agotado por el momento" };
  }

  // 3) Merge con el carrito actual: suma qty con tope 9 y tope disponible.
  const items = await leerCarrito();
  const existente = items.find((item) => item.variantId === variantId);
  const nuevaQty = Math.min((existente?.qty ?? 0) + qty, QTY_MAX, disponible);

  const nuevos = existente
    ? items.map((item) =>
        item.variantId === variantId ? { ...item, qty: nuevaQty } : item
      )
    : [...items, { variantId, qty: nuevaQty }];

  await escribirCarrito(nuevos);
  revalidatePath("/carrito");
  return { ok: true, mensaje: "Agregado al carrito" };
}

/**
 * actualizarCantidad — fija la cantidad de una variante desde el formulario
 * de la página del carrito. qty se acota a 0..9 y con 0 la línea se elimina.
 */
export async function actualizarCantidad(formData: FormData): Promise<void> {
  const variantId = String(formData.get("variantId") ?? "");
  if (!UUID_RE.test(variantId)) return;

  const qtyCruda = Number(formData.get("qty"));
  if (!Number.isFinite(qtyCruda)) return;
  // Clamp 0..9 (0 = eliminar la línea).
  const qty = Math.min(Math.max(Math.trunc(qtyCruda), 0), QTY_MAX);

  const items = await leerCarrito();
  const nuevos =
    qty === 0
      ? items.filter((item) => item.variantId !== variantId)
      : items.map((item) =>
          item.variantId === variantId ? { ...item, qty } : item
        );

  await escribirCarrito(nuevos);
  revalidatePath("/carrito");
}

/** quitarDelCarrito — elimina la línea de la variante indicada. */
export async function quitarDelCarrito(formData: FormData): Promise<void> {
  const variantId = String(formData.get("variantId") ?? "");
  if (!UUID_RE.test(variantId)) return;

  const items = await leerCarrito();
  await escribirCarrito(items.filter((item) => item.variantId !== variantId));
  revalidatePath("/carrito");
}

/** vaciarCarrito — deja la cookie con un carrito vacío (firmado igualmente). */
export async function vaciarCarrito(): Promise<void> {
  await escribirCarrito([]);
  revalidatePath("/carrito");
}

// Fin de las Server Actions del carrito.
