// Ficha de producto (mobile-first, Server Component).
// En Next.js 15 los params de rutas dinámicas son una Promise (hay que await).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerProducto } from "@/lib/producto";
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
      <ProductGallery imagenes={p.imagenes} nombre={p.nombre} />

      <section className="space-y-4 p-4">
        <div className="space-y-2">
          {badgeTipo && <Badge>{badgeTipo}</Badge>}
          <h1 className="text-xl font-semibold">{p.nombre}</h1>
          <Link
            href={`/tienda/${p.vendor.slug}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:underline"
          >
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

        <div className="rounded-lg border bg-muted/50 p-3 text-sm">
          📍 Entrega en {p.vendor.aulaDefault ?? "punto de entrega del campus"}
        </div>
      </section>
    </main>
  );
}
