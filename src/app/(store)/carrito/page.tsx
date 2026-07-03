// Carrito de compras (Server Component, mobile-first).
// Agrupado por tienda: cada vendedor cobra a su propia CLABE, así que el
// checkout (Fase 5) se hace POR tienda; el total general es solo informativo.
import type { Metadata } from "next";
import Link from "next/link";
import { leerCarrito, resolverCarrito } from "@/lib/cart";
import { vaciarCarrito } from "@/app/(store)/carrito/actions";
import { CartLine } from "@/components/CartLine";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { AlertTriangle, ArrowRight, MapPin, ShoppingCart, Store, Trash2 } from "lucide-react";

export const metadata: Metadata = { title: "Carrito" };

// Los montos llegan como numeric-string de Postgres; Number solo para formatear.
const formatoMXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export default async function CartPage() {
  const items = await leerCarrito();
  const carrito = await resolverCarrito(items);

  // Estado vacío: invitación a explorar el catálogo.
  if (carrito.grupos.length === 0) {
    return (
      <main className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
          <ShoppingCart aria-hidden="true" className="h-6 w-6 text-muted-foreground" />
        </div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          Tu carrito está vacío
        </h1>
        <p className="text-sm text-muted-foreground">Explora el catálogo del campus</p>
        <Link
          href="/"
          className="mt-2 inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
        >
          Ir a explorar
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </main>
    );
  }

  return (
    // pb-32 deja aire para la barra fija de resumen + la navegación inferior.
    <main className="space-y-4 p-4 pb-32">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          Carrito ({carrito.totalItems})
        </h1>
        {/* Vaciar es reversible (basta re-agregar), no requiere confirmación. */}
        <form action={vaciarCarrito}>
          <button
            type="submit"
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors duration-200 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
          >
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            Vaciar
          </button>
        </form>
      </div>

      {/* Aviso de líneas descartadas al resolver el carrito contra el stock actual. */}
      {carrito.descartados > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none" />
          <p>Se quitaron {carrito.descartados} artículos que ya no están disponibles.</p>
        </div>
      )}

      {/* Un Card por tienda: cada una tiene su propio subtotal y su propio pago. */}
      {carrito.grupos.map((grupo) => (
        <Card key={grupo.vendor.id}>
          <CardHeader className="space-y-1">
            <Link
              href={`/tienda/${grupo.vendor.slug}`}
              className="inline-flex items-center gap-2 font-heading text-sm font-medium underline-offset-2 hover:underline"
            >
              <Store aria-hidden="true" className="h-4 w-4 flex-none text-primary" />
              {grupo.vendor.nombre}
            </Link>
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin aria-hidden="true" className="h-3.5 w-3.5 flex-none" />
              Entrega: {grupo.vendor.aulaDefault ?? "por definir"}
            </p>
          </CardHeader>
          <CardContent className="divide-y">
            {grupo.lineas.map((linea) => (
              <CartLine key={linea.variantId} linea={linea} />
            ))}
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-2 border-t pt-4">
            <p className="text-right text-sm">
              <span className="text-muted-foreground">Subtotal {grupo.vendor.nombre}: </span>
              <span className="font-heading font-semibold tabular-nums">
                {formatoMXN.format(Number(grupo.subtotal))}
              </span>
            </p>
            {/* El checkout llega en Fase 5; el botón ya navega a la ruta por tienda. */}
            <Link
              href={`/checkout?tienda=${grupo.vendor.slug}`}
              className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
            >
              Pagar a esta tienda
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <p className="text-center text-xs text-muted-foreground">
              Cada tienda cobra por separado (SPEI directo)
            </p>
          </CardFooter>
        </Card>
      ))}

      {/* Barra de resumen fija: sobre la nav inferior en móvil, al ras en desktop.
          Solo informativa: el pago real se hace tienda por tienda. */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t bg-background/95 p-3 backdrop-blur md:bottom-0 md:pb-safe">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Total ({carrito.totalItems} artículos)
          </span>
          <span className="font-heading text-lg font-bold tabular-nums">
            {formatoMXN.format(Number(carrito.total))}
          </span>
        </div>
      </div>
    </main>
  );
}
