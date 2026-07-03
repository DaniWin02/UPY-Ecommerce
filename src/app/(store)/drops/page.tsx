// Drops: lanzamientos limitados de la comunidad (Server Component).
// V1 traerá drops programados con cuenta regresiva; hoy lista los activos.
import type { Metadata } from "next";
import { and, desc, eq, sql } from "drizzle-orm";
import { Clock, Flame, ShoppingBag } from "lucide-react";
import { db } from "@/db";
import { products, productVariants, inventory } from "@/db/schema/products";
import { vendors } from "@/db/schema/vendors";
import { Badge } from "@/components/ui/badge";
import { TrackedProductLink } from "@/components/analytics/Trackers";

export const metadata: Metadata = {
  title: "Drops",
  description: "Lanzamientos limitados de la comunidad del campus.",
};

// Formato de moneda MXN (precioDesde llega como numeric-string de Postgres).
const formatoMXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

/**
 * Drops activos de vendors activos, con agregados por producto:
 * primera imagen, MIN(precio) y SUM(stock - reservado).
 * (Query local: mismo patrón que obtenerTienda, sin tocar src/lib/producto.ts.)
 */
async function obtenerDropsActivos() {
  return db
    .select({
      id: products.id,
      nombre: products.nombre,
      imagenUrl: sql<string | null>`(${products.imagenes})[1]`,
      vendorId: vendors.id,
      vendorNombre: vendors.nombre,
      precioDesde: sql<string>`min(${productVariants.precio})`,
      stockDisponible: sql<number>`coalesce(sum(greatest(coalesce(${inventory.stock}, 0) - coalesce(${inventory.reservado}, 0), 0)), 0)::int`,
    })
    .from(products)
    .innerJoin(vendors, eq(vendors.id, products.vendorId))
    .innerJoin(productVariants, eq(productVariants.productId, products.id))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(
      and(
        eq(products.tipo, "drop"),
        eq(products.estado, "activo"),
        eq(vendors.estado, "activo")
      )
    )
    .groupBy(products.id, vendors.id)
    .orderBy(desc(products.createdAt));
}

export default async function DropsPage() {
  const drops = await obtenerDropsActivos();

  return (
    <main className="pb-20">
      <div className="container space-y-4 pt-4">
        {/* Cabecera de la sección */}
        <header className="flex items-center gap-3">
          <span
            className="grid h-11 w-11 flex-none place-items-center rounded-full bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <Flame className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-heading text-xl font-semibold tracking-tight md:text-2xl">
              Drops
            </h1>
            <p className="text-sm text-muted-foreground">
              Lanzamientos limitados de la comunidad
            </p>
          </div>
        </header>

        {/* Aviso sobrio: la cuenta regresiva llega en la siguiente versión */}
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <Clock className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" aria-hidden />
          <p className="leading-relaxed text-muted-foreground">
            Los drops programados con cuenta regresiva llegan pronto. Mientras
            tanto, estos son los lanzamientos activos.
          </p>
        </div>

        {drops.length === 0 ? (
          // Empty state según MASTER: círculo suave + icono + título + descripción.
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-muted" aria-hidden="true">
              <Flame className="h-6 w-6 text-muted-foreground" />
            </span>
            <p className="font-medium">No hay drops activos ahora mismo</p>
            <p className="text-sm text-muted-foreground">
              Sigue atento: los próximos lanzamientos aparecerán aquí.
            </p>
          </div>
        ) : (
          // Grid de drops con markup propio (mismo look de tarjeta del repo).
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {drops.map((drop, i) => {
              const agotado = drop.stockDisponible === 0;
              return (
                <TrackedProductLink
                  key={drop.id}
                  href={`/producto/${drop.id}`}
                  productId={drop.id}
                  vendorId={drop.vendorId}
                  posicion={i}
                  origen="drops"
                  className="group cursor-pointer overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-muted">
                    {drop.imagenUrl ? (
                      <img
                        src={drop.imagenUrl}
                        alt={drop.nombre}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center"
                        aria-hidden="true"
                      >
                        <ShoppingBag className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="absolute left-2 top-2 flex gap-1.5">
                      <Badge className="border-transparent bg-primary text-primary-foreground">
                        Drop
                      </Badge>
                      {agotado && (
                        <Badge className="border-transparent bg-foreground/80 text-background backdrop-blur">
                          Agotado
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1 p-3">
                    <p className="line-clamp-2 text-sm font-medium leading-snug">
                      {drop.nombre}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {drop.vendorNombre}
                    </p>
                    <p className="font-heading text-sm font-semibold tracking-tight">
                      Desde {formatoMXN.format(Number(drop.precioDesde))}
                    </p>
                  </div>
                </TrackedProductLink>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
