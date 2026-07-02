"use server";

// Server actions del CRUD mínimo de productos del panel del vendedor.
// Todas verifican pertenencia al vendor de la sesión: NUNCA se confía
// en ids que lleguen del formulario.
import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { products, productVariants, inventory } from "@/db/schema/products";
import { requireVendorMember } from "@/lib/session";

// ---------------------------------------------------------------------------
// Vendor actual
// ---------------------------------------------------------------------------

// DECISIÓN MVP: el panel opera SIEMPRE sobre la PRIMERA membresía del usuario.
// El selector multi-tienda llega en una fase posterior.
async function vendorActual() {
  const { memberships } = await requireVendorMember();
  const actual = memberships[0];
  // Caso superadmin sin tienda propia: no hay vendor sobre el que operar.
  if (!actual) redirect("/");
  return actual;
}

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

// Convierte "" (campo vacío de FormData) en undefined para campos opcionales.
const vacioAUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

// Datos base del producto. `imagenes` llega como textarea "una URL por línea"
// y se transforma a array filtrando líneas vacías (máx. 6, deben ser http/https).
// Nota: sin `export` — un módulo "use server" solo puede exportar funciones async.
const productoSchema = z.object({
  nombre: z.string().trim().min(3).max(120),
  descripcion: z.preprocess(
    vacioAUndefined,
    z.string().trim().max(2000).optional()
  ),
  tipo: z.enum(["fisico", "preventa", "drop"]),
  // Desde el panel solo se publica o se guarda como borrador; agotado/archivado
  // se gestionan por otros flujos.
  estado: z.enum(["borrador", "activo"]),
  imagenes: z
    .string()
    .optional()
    .default("")
    .transform((v) =>
      v
        .split(/\r?\n/)
        .map((linea) => linea.trim())
        .filter((linea) => linea.length > 0)
    )
    .pipe(
      z
        .array(
          // Cada línea debe ser una URL válida, http(s) y de longitud acotada
          // (startsWith("http") solo dejaba pasar cualquier string con ese prefijo).
          z
            .string()
            .url()
            .max(500)
            .refine((u) => /^https?:\/\//.test(u), {
              message: "Solo URLs http(s)",
            })
        )
        .max(6)
    ),
});

// Datos de una variante + su stock inicial. Los precios se coercionan a number
// para validar y se guardan como string con 2 decimales (columna numeric).
const varianteSchema = z
  .object({
    talla: z.preprocess(vacioAUndefined, z.string().trim().max(20).optional()),
    color: z.preprocess(vacioAUndefined, z.string().trim().max(30).optional()),
    precio: z.coerce
      .number()
      .positive()
      .max(99999)
      .transform((n) => n.toFixed(2)),
    precioComunidad: z.preprocess(
      vacioAUndefined,
      z.coerce
        .number()
        .positive()
        .max(99999)
        .transform((n) => n.toFixed(2))
        .optional()
    ),
    stock: z.coerce.number().int().min(0).max(9999),
  })
  // El precio comunidad nunca puede superar al precio público.
  .refine(
    (v) =>
      v.precioComunidad === undefined ||
      Number(v.precioComunidad) <= Number(v.precio),
    { message: "El precio comunidad debe ser menor o igual al precio" }
  );

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

// SKU único legible: slug del nombre (sin acentos, MAYÚSCULAS, guiones) + sufijo aleatorio.
// Ej.: "Sudadera Ágora" → "SUDADERA-AGORA-A3F91C".
function generarSku(nombre: string): string {
  const base = nombre
    .normalize("NFD")
    .replace(/[\u{300}-\u{36f}]/gu, "") // quita marcas diacríticas (acentos)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-") // todo lo demás → guiones
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  // Sufijo con CSPRNG (6 chars hex): más entropía y sin depender de Math.random.
  const sufijo = randomBytes(3).toString("hex").toUpperCase();
  return `${base || "SKU"}-${sufijo}`;
}

// Verifica que el producto exista y pertenezca al vendor; si no, redirige.
async function productoDelVendor(productId: string, vendorId: string) {
  const [producto] = await db
    .select({ id: products.id, nombre: products.nombre })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.vendorId, vendorId)))
    .limit(1);
  if (!producto) redirect("/vendor/productos?error=NoAutorizado");
  return producto;
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

/** Crea un producto con su primera variante e inventario inicial. */
export async function crearProducto(formData: FormData) {
  const vendor = await vendorActual();

  const producto = productoSchema.safeParse({
    nombre: formData.get("nombre"),
    descripcion: formData.get("descripcion"),
    tipo: formData.get("tipo"),
    estado: formData.get("estado"),
    imagenes: formData.get("imagenes") ?? "",
  });
  const variante = varianteSchema.safeParse({
    talla: formData.get("talla"),
    color: formData.get("color"),
    precio: formData.get("precio"),
    precioComunidad: formData.get("precioComunidad"),
    stock: formData.get("stock"),
  });

  // V1 mostrará el detalle por campo; en el MVP basta el aviso genérico.
  if (!producto.success || !variante.success) {
    redirect("/vendor/productos/nuevo?error=Validacion");
  }

  const sku = generarSku(producto.data.nombre);

  // Transacción: producto → variante → inventario (todo o nada).
  await db.transaction(async (tx) => {
    const [nuevoProducto] = await tx
      .insert(products)
      .values({
        vendorId: vendor.vendorId,
        nombre: producto.data.nombre,
        descripcion: producto.data.descripcion ?? null,
        tipo: producto.data.tipo,
        estado: producto.data.estado,
        imagenes: producto.data.imagenes,
      })
      .returning({ id: products.id });

    const [nuevaVariante] = await tx
      .insert(productVariants)
      .values({
        productId: nuevoProducto.id,
        sku,
        atributos: {
          ...(variante.data.talla ? { talla: variante.data.talla } : {}),
          ...(variante.data.color ? { color: variante.data.color } : {}),
        },
        precio: variante.data.precio,
        precioComunidad: variante.data.precioComunidad ?? null,
      })
      .returning({ id: productVariants.id });

    await tx.insert(inventory).values({
      variantId: nuevaVariante.id,
      stock: variante.data.stock,
      reservado: 0,
    });
  });

  revalidatePath("/vendor/productos");
  redirect("/vendor/productos");
}

/** Actualiza los datos base de un producto (verifica pertenencia). */
export async function actualizarProducto(productId: string, formData: FormData) {
  const vendor = await vendorActual();
  await productoDelVendor(productId, vendor.vendorId);

  const producto = productoSchema.safeParse({
    nombre: formData.get("nombre"),
    descripcion: formData.get("descripcion"),
    tipo: formData.get("tipo"),
    estado: formData.get("estado"),
    imagenes: formData.get("imagenes") ?? "",
  });
  if (!producto.success) {
    redirect(`/vendor/productos/${productId}?error=Validacion`);
  }

  await db
    .update(products)
    .set({
      nombre: producto.data.nombre,
      descripcion: producto.data.descripcion ?? null,
      tipo: producto.data.tipo,
      estado: producto.data.estado,
      imagenes: producto.data.imagenes,
    })
    .where(and(eq(products.id, productId), eq(products.vendorId, vendor.vendorId)));

  revalidatePath("/vendor/productos");
  revalidatePath(`/vendor/productos/${productId}`);
  redirect(`/vendor/productos/${productId}`);
}

/** Agrega una variante (con inventario) a un producto existente del vendor. */
export async function agregarVariante(productId: string, formData: FormData) {
  const vendor = await vendorActual();
  const producto = await productoDelVendor(productId, vendor.vendorId);

  const variante = varianteSchema.safeParse({
    talla: formData.get("talla"),
    color: formData.get("color"),
    precio: formData.get("precio"),
    precioComunidad: formData.get("precioComunidad"),
    stock: formData.get("stock"),
  });
  if (!variante.success) {
    redirect(`/vendor/productos/${productId}?error=Validacion`);
  }

  const sku = generarSku(producto.nombre);

  await db.transaction(async (tx) => {
    const [nuevaVariante] = await tx
      .insert(productVariants)
      .values({
        productId,
        sku,
        atributos: {
          ...(variante.data.talla ? { talla: variante.data.talla } : {}),
          ...(variante.data.color ? { color: variante.data.color } : {}),
        },
        precio: variante.data.precio,
        precioComunidad: variante.data.precioComunidad ?? null,
      })
      .returning({ id: productVariants.id });

    await tx.insert(inventory).values({
      variantId: nuevaVariante.id,
      stock: variante.data.stock,
      reservado: 0,
    });
  });

  revalidatePath(`/vendor/productos/${productId}`);
  redirect(`/vendor/productos/${productId}`);
}

/** Actualiza stock y precios de una variante (pertenencia vía JOIN a products). */
export async function actualizarStock(variantId: string, formData: FormData) {
  const vendor = await vendorActual();

  // Pertenencia: variante → producto → vendorId de la sesión.
  const [fila] = await db
    .select({ variantId: productVariants.id, productId: products.id })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      and(eq(productVariants.id, variantId), eq(products.vendorId, vendor.vendorId))
    )
    .limit(1);
  if (!fila) redirect("/vendor/productos?error=NoAutorizado");

  const variante = varianteSchema.safeParse({
    precio: formData.get("precio"),
    precioComunidad: formData.get("precioComunidad"),
    stock: formData.get("stock"),
  });
  if (!variante.success) {
    redirect(`/vendor/productos/${fila.productId}?error=Validacion`);
  }

  let stockRechazado = false;
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(productVariants)
        .set({
          precio: variante.data.precio,
          precioComunidad: variante.data.precioComunidad ?? null,
        })
        .where(eq(productVariants.id, variantId));

      // Solo se cambia `stock`; `reservado` es de los holds de checkout.
      // Si el nuevo stock queda por debajo de lo reservado, el CHECK
      // inventory_reservado_valido de la BD rechaza la transacción completa.
      await tx
        .update(inventory)
        .set({ stock: variante.data.stock })
        .where(eq(inventory.variantId, variantId));
    });
  } catch (error) {
    // Solo el CHECK inventory_reservado_valido (23514 = check_violation) se
    // mapea al error de negocio; el code de pg puede venir en el error directo
    // o anidado en error.cause según cómo lo envuelva el driver/Drizzle.
    const code =
      (error as { code?: string })?.code ??
      (error as { cause?: { code?: string } })?.cause?.code;
    if (code === "23514") {
      stockRechazado = true;
    } else {
      throw error; // cualquier otro fallo de BD NO es un problema de stock
    }
  }
  // redirect() lanza excepción: debe ir FUERA del try/catch para no tragarla.
  if (stockRechazado) {
    redirect(`/vendor/productos/${fila.productId}?error=StockMenorQueReservado`);
  }

  revalidatePath(`/vendor/productos/${fila.productId}`);
  redirect(`/vendor/productos/${fila.productId}`);
}

// Fin de las acciones de productos del vendedor.
