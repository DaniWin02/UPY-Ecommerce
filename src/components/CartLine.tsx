// Fila de una línea del carrito (Server Component, sin JS en el cliente).
// Los controles de cantidad son <form> con server actions: funcionan sin hidratación.
import type { LineaCarrito } from "@/lib/cart";
import { actualizarCantidad, quitarDelCarrito } from "@/app/(store)/carrito/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Los precios llegan como numeric-string de Postgres; Number solo para formatear.
const formatoMXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export function CartLine({ linea }: { linea: LineaCarrito }) {
  const sinStock = linea.disponible === 0;
  const excedeStock = linea.qty > linea.disponible && linea.disponible > 0;
  // Tope de 9 por línea, y nunca más de lo disponible.
  const noIncrementable = linea.qty >= 9 || linea.qty >= linea.disponible;

  const atributos = linea.atributos
    ? [linea.atributos.talla, linea.atributos.color].filter(Boolean).join(" · ")
    : null;

  return (
    <div className="flex gap-3 py-3">
      {/* Imagen (64px) o placeholder. */}
      <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-md bg-muted">
        {linea.imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={linea.imagenUrl}
            alt={linea.nombre}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden="true" className="text-2xl">
            🛍️
          </span>
        )}
      </div>

      {/* Nombre, atributos, precio y controles. */}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{linea.nombre}</p>
        {atributos && <p className="text-xs text-muted-foreground">{atributos}</p>}
        <p className="text-sm text-muted-foreground">
          {formatoMXN.format(Number(linea.precioUnit))}
        </p>

        {/* Avisos de disponibilidad. */}
        {sinStock && <Badge variant="destructive">Sin stock</Badge>}
        {excedeStock && (
          <p className="text-xs text-warning">Solo quedan {linea.disponible}</p>
        )}

        {/* Controles de cantidad: − / qty / + como forms independientes. */}
        <div className="flex items-center gap-2 pt-1">
          <form action={actualizarCantidad}>
            <input type="hidden" name="variantId" value={linea.variantId} />
            <input type="hidden" name="qty" value={linea.qty - 1} />
            <Button
              type="submit"
              size="icon"
              variant="outline"
              className="h-9 w-9"
              aria-label={`Quitar una unidad de ${linea.nombre}`}
            >
              −
            </Button>
          </form>
          <span className="w-6 text-center text-sm tabular-nums" aria-live="polite">
            {linea.qty}
          </span>
          <form action={actualizarCantidad}>
            <input type="hidden" name="variantId" value={linea.variantId} />
            <input type="hidden" name="qty" value={linea.qty + 1} />
            <Button
              type="submit"
              size="icon"
              variant="outline"
              className="h-9 w-9"
              disabled={noIncrementable}
              aria-label={`Agregar una unidad de ${linea.nombre}`}
            >
              +
            </Button>
          </form>
          <form action={quitarDelCarrito}>
            <input type="hidden" name="variantId" value={linea.variantId} />
            <button type="submit" className="px-2 text-xs text-destructive underline-offset-2 hover:underline">
              Quitar
            </button>
          </form>
        </div>
      </div>

      {/* Subtotal de la línea. */}
      <p className="flex-none text-right text-sm font-semibold">
        {formatoMXN.format(Number(linea.subtotal))}
      </p>
    </div>
  );
}
