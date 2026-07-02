// catalog.ts — consultas del catálogo público del marketplace (SOLO servidor).
// Agrega precios/stock por producto y aplica los filtros de la búsqueda.
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { products, productVariants, inventory } from "@/db/schema/products";
import { vendors } from "@/db/schema/vendors";

// Filtros que llegan de los searchParams de la página de catálogo.
export type FiltrosCatalogo = {
  q?: string;
  tienda?: string;
  tipo?: "fisico" | "preventa" | "drop";
  min?: number;
  max?: number;
};

// Fila del catálogo lista para pintar en la grid (precios numeric como string).
export type ProductoCatalogo = {
  id: string;
  nombre: string;
  tipo: string;
  imagenUrl: string | null;
  vendorNombre: string;
  vendorSlug: string;
  precioDesde: string;
  precioComunidadDesde: string | null;
  stockDisponible: number;
};

/**
 * buscarProductos — catálogo activo con agregados por producto:
 * MIN(precio), MIN(precio_comunidad), SUM(stock - reservado) y primera imagen.
 * La búsqueda por nombre usa unaccent + LIKE con parámetros (nunca interpolación directa).
 */
export async function buscarProductos(f: FiltrosCatalogo): Promise<ProductoCatalogo[]> {
  // Condiciones del WHERE: solo productos y vendors activos.
  const condiciones: SQL[] = [eq(products.estado, "activo"), eq(vendors.estado, "activo")];

  if (f.q) {
    // Búsqueda insensible a acentos y mayúsculas; `f.q` viaja como parámetro.
    // Escapamos los metacaracteres de LIKE (\ % _) para que el usuario no
    // pueda inyectar comodines en el patrón.
    const qEscapada = f.q.replace(/[\\%_]/g, "\\$&");
    condiciones.push(
      sql`unaccent(lower(${products.nombre})) LIKE unaccent(lower('%' || ${qEscapada} || '%'))`
    );
  }
  if (f.tienda) condiciones.push(eq(vendors.slug, f.tienda));
  if (f.tipo) condiciones.push(eq(products.tipo, f.tipo));

  // Filtros de precio sobre el precio efectivo mínimo → van en HAVING.
  // coalesce: si la variante no tiene precio comunidad se usa el precio
  // público, para NO excluir productos sin precio comunidad del filtro.
  const condicionesHaving: SQL[] = [];
  if (f.min !== undefined) {
    condicionesHaving.push(
      sql`min(coalesce(${productVariants.precioComunidad}, ${productVariants.precio})) >= ${f.min}`
    );
  }
  if (f.max !== undefined) {
    condicionesHaving.push(
      sql`min(coalesce(${productVariants.precioComunidad}, ${productVariants.precio})) <= ${f.max}`
    );
  }

  const filas = await db
    .select({
      id: products.id,
      nombre: products.nombre,
      tipo: products.tipo,
      // Primera imagen del arreglo (índice 1 en Postgres; NULL si está vacío).
      imagenUrl: sql<string | null>`(${products.imagenes})[1]`,
      vendorNombre: vendors.nombre,
      vendorSlug: vendors.slug,
      precioDesde: sql<string>`coalesce(min(${productVariants.precio}), 0)::text`,
      precioComunidadDesde: sql<string | null>`min(${productVariants.precioComunidad})::text`,
      stockDisponible: sql<number>`coalesce(sum(${inventory.stock} - ${inventory.reservado}), 0)::int`,
    })
    .from(products)
    .innerJoin(vendors, eq(products.vendorId, vendors.id))
    .leftJoin(productVariants, eq(productVariants.productId, products.id))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(and(...condiciones))
    .groupBy(products.id, vendors.id)
    .having(condicionesHaving.length > 0 ? and(...condicionesHaving) : undefined)
    .orderBy(desc(products.createdAt))
    .limit(60);

  return filas;
}

/**
 * listarVendorsActivos — tiendas aprobadas para el select de filtros.
 */
export async function listarVendorsActivos(): Promise<Array<{ slug: string; nombre: string }>> {
  return db
    .select({ slug: vendors.slug, nombre: vendors.nombre })
    .from(vendors)
    .where(eq(vendors.estado, "activo"))
    .orderBy(vendors.nombre);
}

// Fin de catalog.ts
