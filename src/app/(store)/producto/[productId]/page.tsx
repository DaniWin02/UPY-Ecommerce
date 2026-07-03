// Ficha de producto (mobile-first, Server Component).
// En Next.js 15 los params de rutas dinámicas son una Promise (hay que await).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Store } from "lucide-react";
import { obtenerProducto } from "@/lib/producto";
import { TrackVistaProducto } from "@/components/analytics/Trackers";
import { ProductGallery } from "@/components/ProductGallery";
import { VariantSelector } from "@/components/VariantSelector";
import { VendorBadge } from "@/components/VendorBadge";
import { Badge } from "@/components/ui/badge";

type Props = {
  params: Promise<{ productId: string }>;
};

// Etiquetas de los tipos especiales (los físicos no llevan badge).
const BADGE_TIPO: Partial<Record<string, string>> = {
  drop: "Drop",
  preventa: "Preventa",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { productId } = await params;
  // obtenerProducto está envuelto en React cache: no duplica la consulta de la page.
  const producto = await obtenerProducto(productId);
  if (!producto) return { title: "Producto no encontrado" };
  return {
    title: producto.nombre,
    description: producto.descripcion ?? undefined,
  };
}

export default async function ProductPage({ params }: Props) {
  const { productId } = await params;
  const p = await obtenerProducto(productId);
  if (!p) notFound();

  const badgeTipo = BADGE_TIPO[p.tipo];

  return (
    // pb-40: deja hueco para la barra CTA fija + la tabbar móvil.
    <main className="pb-40">
      {/* Analytics: vista de producto (obtenerProducto no expone el id del vendor). */}
      <TrackVistaProducto productId={p.id} />
      <ProductGallery imagenes={p.imagenes} nombre={p.nombre} />

      <section className="space-y-4 p-4">
        <div className="space-y-2">
          {badgeTipo && <Badge>{badgeTipo}</Badge>}
          <h1 className="font-heading text-xl font-semibold tracking-tight">{p.nombre}</h1>
          <Link
            href={`/tienda/${p.vendor.slug}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground hover:underline"
          >
            <Store className="h-3.5 w-3.5" aria-hidden />
            <span>Vendido por {p.vendor.nombre}</span>
            <VendorBadge tipo={p.vendor.tipo} />
          </Link>
        </div>

        {p.descripcion && (
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {p.descripcion}
          </p>
        )}

        <VariantSelector variantes={p.variantes} />

        <div className="flex items-start gap-2 rounded-xl border bg-card p-3 text-sm shadow-sm">
          <MapPin className="mt-0.5 h-4 w-4 flex-none text-primary" aria-hidden />
          <span>Entrega en {p.vendor.aulaDefault ?? "punto de entrega del campus"}</span>
        </div>
      </section>
    </main>
  );
}
