// Consultas de catálogo: ficha de producto y página de tienda.
// SOLO SERVIDOR: importa el cliente de BD. Úsalo únicamente desde Server
// Components / route handlers (los client components solo pueden importar tipos).
import { cache } from "react";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, productVariants, inventory, vendors } from "@/db/schema";

// Variante vendible con su disponibilidad real (stock - reservado).
export type VarianteConStock = {
  id: string;
  sku: string;
  atributos: { talla?: string; color?: string } | null;
  precio: string;
  precioComunidad: string | null;
  disponible: number;
};

export type ProductoDetalle = {
  id: string;
  nombre: string;
  descripcion: string | null;
  tipo: "fisico" | "preventa" | "drop";
  estado: "borrador" | "activo" | "agotado" | "archivado";
  imagenes: string[];
  vendor: {
    slug: string;
    nombre: string;
    tipo: "facultad" | "club" | "emprendimiento";
    aulaDefault: string | null;
  };
  variantes: VarianteConStock[];
};

export type TiendaDetalle = {
  vendor: {
    slug: string;
    nombre: string;
    tipo: "facultad" | "club" | "emprendimiento";
    aulaDefault: string | null;
  };
  productos: Array<{
    id: string;
    nombre: string;
    tipo: "fisico" | "preventa" | "drop";
    imagenUrl: string | null;
    precioDesde: string;
    stockDisponible: number;
  }>;
};

// Valida el formato UUID ANTES de consultar: un id basura en la URL provocaría
// un error de cast (invalid input syntax for type uuid) en Postgres.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Ficha de producto: producto ACTIVO + vendor + variantes con disponibilidad.
// `cache` de React deduplica la llamada entre generateMetadata y la page.
export const obtenerProducto = cache(
  async (id: string): Promise<ProductoDetalle | null> => {
    if (!UUID_REGEX.test(id)) return null;

    const [fila] = await db
      .select({
        id: products.id,
        nombre: products.nombre,
        descripcion: products.descripcion,
        tipo: products.tipo,
        estado: products.estado,
        imagenes: products.imagenes,
        vendorSlug: vendors.slug,
        vendorNombre: vendors.nombre,
        vendorTipo: vendors.tipo,
        vendorAula: vendors.aulaDefault,
      })
      .from(products)
      .innerJoin(vendors, eq(vendors.id, products.vendorId))
      .where(and(eq(products.id, id), eq(products.estado, "activo")))
      .limit(1);

    if (!fila) return null;

    // Variantes con LEFT JOIN a inventario: si no hay fila, disponible = 0.
    const filasVariantes = await db
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        atributos: productVariants.atributos,
        precio: productVariants.precio,
        precioComunidad: productVariants.precioComunidad,
        stock: inventory.stock,
        reservado: inventory.reservado,
      })
      .from(productVariants)
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(eq(productVariants.productId, id))
      .orderBy(asc(productVariants.sku));

    const variantes: VarianteConStock[] = filasVariantes.map((v) => ({
      id: v.id,
      sku: v.sku ?? "",
      atributos: (v.atributos ?? null) as VarianteConStock["atributos"],
      precio: v.precio,
      precioComunidad: v.precioComunidad,
      disponible: Math.max(0, (v.stock ?? 0) - (v.reservado ?? 0)),
    }));

    return {
      id: fila.id,
      nombre: fila.nombre,
      descripcion: fila.descripcion,
      tipo: fila.tipo,
      estado: fila.estado,
      imagenes: fila.imagenes ?? [],
      vendor: {
        slug: fila.vendorSlug,
        nombre: fila.vendorNombre,
        tipo: fila.vendorTipo,
        aulaDefault: fila.vendorAula,
      },
      variantes,
    };
  }
);

// Página de tienda: vendor ACTIVO + sus productos activos agregados
// (precio mínimo, stock disponible total y primera imagen).
export const obtenerTienda = cache(
  async (slug: string): Promise<TiendaDetalle | null> => {
    const [vendor] = await db
      .select({
        id: vendors.id,
        slug: vendors.slug,
        nombre: vendors.nombre,
        tipo: vendors.tipo,
        aulaDefault: vendors.aulaDefault,
      })
      .from(vendors)
      .where(and(eq(vendors.slug, slug), eq(vendors.estado, "activo")))
      .limit(1);

    if (!vendor) return null;

    // INNER JOIN a variantes: un producto sin variantes no tiene precio ni
    // se puede vender, así que no aparece en el escaparate.
    const filas = await db
      .select({
        id: products.id,
        nombre: products.nombre,
        tipo: products.tipo,
        imagenes: products.imagenes,
        precioDesde: sql<string>`min(${productVariants.precio})`,
        stockDisponible: sql<number>`coalesce(sum(greatest(coalesce(${inventory.stock}, 0) - coalesce(${inventory.reservado}, 0), 0)), 0)::int`,
      })
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
      .where(and(eq(products.vendorId, vendor.id), eq(products.estado, "activo")))
      // Agrupar por PK basta en Postgres (dependencia funcional del resto de columnas).
      .groupBy(products.id)
      .orderBy(desc(products.createdAt));

    return {
      vendor: {
        slug: vendor.slug,
        nombre: vendor.nombre,
        tipo: vendor.tipo,
        aulaDefault: vendor.aulaDefault,
      },
      productos: filas.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        tipo: p.tipo,
        imagenUrl: p.imagenes?.[0] ?? null,
        precioDesde: p.precioDesde,
        stockDisponible: p.stockDisponible,
      })),
    };
  }
);

// Fin de las consultas de catálogo.
