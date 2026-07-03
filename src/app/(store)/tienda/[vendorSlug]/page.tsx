// Escaparate de un vendedor de la comunidad (mobile-first, Server Component).
// En Next.js 15 los params de rutas dinámicas son una Promise (hay que await).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, PackageOpen, ShoppingBag, UserPlus } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vendors } from "@/db/schema/vendors";
import { obtenerTienda } from "@/lib/producto";
import { TrackVistaTienda } from "@/components/analytics/Trackers";
import { VendorBadge } from "@/components/VendorBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Props = {
  params: Promise<{ vendorSlug: string }>;
};

// Formato de moneda MXN (precioDesde llega como numeric-string de Postgres).
const formatoMXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { vendorSlug } = await params;
  // obtenerTienda está envuelto en React cache: no duplica la consulta de la page.
  const tienda = await obtenerTienda(vendorSlug);
  return { title: tienda ? tienda.vendor.nombre : "Tienda no encontrada" };
}

export default async function VendorStorePage({ params }: Props) {
  const { vendorSlug } = await params;
  const t = await obtenerTienda(vendorSlug);
  if (!t) notFound();

  // obtenerTienda no expone el id del vendor: mini-consulta local solo para analytics.
  const [vendorFila] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(eq(vendors.slug, vendorSlug))
    .limit(1);

  const inicial = t.vendor.nombre.charAt(0).toUpperCase();

  return (
    <main className="pb-20">
      {/* Analytics: vista de tienda (render null). */}
      {vendorFila && <TrackVistaTienda vendorId={vendorFila.id} />}
      {/* Cabecera de la tienda: banner sutil con avatar y datos del vendedor. */}
      <header className="border-b bg-gradient-to-br from-primary/15 to-primary/5 p-6">
        <div className="flex items-start gap-4">
          <div
            className="flex h-16 w-16 flex-none items-center justify-center rounded-xl bg-primary font-heading text-2xl font-bold text-primary-foreground shadow-sm"
            aria-hidden="true"
          >
            {inicial}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h1 className="font-heading text-xl font-semibold tracking-tight">
              {t.vendor.nombre}
            </h1>
            <VendorBadge tipo={t.vendor.tipo} />
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 flex-none text-primary" aria-hidden />
              <span>Entrega: {t.vendor.aulaDefault ?? "por definir"}</span>
            </p>
          </div>
          {/* TODO: seguir tiendas llegará con la capa social. */}
          <Button size="sm" variant="outline" disabled title="Próximamente" className="gap-1.5">
            <UserPlus className="h-4 w-4" aria-hidden />
            Seguir
          </Button>
        </div>
      </header>

      {/* Grid de productos (markup propio y sencillo, sin ProductCard). */}
      {t.productos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-muted" aria-hidden="true">
            <PackageOpen className="h-6 w-6 text-muted-foreground" />
          </span>
          <p className="font-medium">Aún no hay productos</p>
          <p className="text-sm text-muted-foreground">
            Esta tienda aún no tiene productos publicados. Vuelve pronto.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3">
          {t.productos.map((producto) => {
            const agotado = producto.stockDisponible === 0;
            return (
              <Link
                key={producto.id}
                href={`/producto/${producto.id}`}
                className="group cursor-pointer overflow-hidden rounded-xl border bg-card shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md"
              >
                <div className="relative aspect-square w-full overflow-hidden bg-muted">
                  {producto.imagenUrl ? (
                    <img
                      src={producto.imagenUrl}
                      alt={producto.nombre}
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
                  {agotado && (
                    <div className="absolute left-2 top-2">
                      <Badge className="border-transparent bg-foreground/80 text-background backdrop-blur">
                        Agotado
                      </Badge>
                    </div>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="line-clamp-2 text-sm font-medium leading-snug">
                    {producto.nombre}
                  </p>
                  <p className="font-heading text-sm font-semibold tracking-tight">
                    Desde {formatoMXN.format(Number(producto.precioDesde))}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
