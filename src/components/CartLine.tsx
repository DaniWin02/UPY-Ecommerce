// Fila de una línea del carrito (Server Component, sin JS en el cliente).
// Los controles de cantidad son <form> con server actions: funcionan sin hidratación.
import type { LineaCarrito } from "@/lib/cart";
import { actualizarCantidad, quitarDelCarrito } from "@/app/(store)/carrito/actions";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";

// Los precios llegan como numeric-string de Postgres; Number solo para formatear.
const formatoMXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

// Botones del stepper de cantidad: cuadrados dentro del contenedor con borde.
const botonStepper =
  "grid h-9 w-9 cursor-pointer place-items-center text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80 disabled:pointer-events-none disabled:opacity-40";

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
      <div className="flex h-16 w-16 flex-none items-center justify-center overflow-hidden rounded-lg bg-muted">
        {linea.imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={linea.imagenUrl}
            alt={linea.nombre}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <ShoppingBag aria-hidden="true" className="h-5 w-5 text-muted-foreground/40" />
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
          <p className="flex items-center gap-1 text-xs text-warning">
            <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 flex-none" />
            Solo quedan {linea.disponible}
          </p>
        )}

        {/* Controles de cantidad: − / qty / + como forms independientes,
            unificados visualmente en un solo stepper con borde. */}
        <div className="flex items-center gap-2 pt-1">
          <div className="inline-flex items-center overflow-hidden rounded-lg border">
            <form action={actualizarCantidad}>
              <input type="hidden" name="variantId" value={linea.variantId} />
              <input type="hidden" name="qty" value={linea.qty - 1} />
              <button
                type="submit"
                className={botonStepper}
                aria-label={`Quitar una unidad de ${linea.nombre}`}
              >
                <Minus aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </form>
            <span className="w-8 text-center text-sm font-medium tabular-nums" aria-live="polite">
              {linea.qty}
            </span>
            <form action={actualizarCantidad}>
              <input type="hidden" name="variantId" value={linea.variantId} />
              <input type="hidden" name="qty" value={linea.qty + 1} />
              <button
                type="submit"
                className={botonStepper}
                disabled={noIncrementable}
                aria-label={`Agregar una unidad de ${linea.nombre}`}
              >
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </form>
          </div>

          <form action={quitarDelCarrito}>
            <input type="hidden" name="variantId" value={linea.variantId} />
            <button
              type="submit"
              aria-label={`Quitar ${linea.nombre} del carrito`}
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors duration-200 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Subtotal de la línea. */}
      <p className="flex-none text-right font-heading text-sm font-semibold tabular-nums">
        {formatoMXN.format(Number(linea.subtotal))}
      </p>
    </div>
  );
}
