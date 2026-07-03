import { ShoppingBag } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ProductCard — tarjeta del catálogo. Sin onClick: se envuelve en <Link> desde fuera.
export interface ProductCardProps {
  id: string;
  nombre: string;
  vendedor: string;
  vendorSlug?: string;
  /** Precio mínimo del producto (numeric de Postgres como string) */
  precio: string;
  precioComunidad?: string | null;
  stockDisponible?: number;
  tipo?: string;
  imagenUrl?: string | null;
}

// Formatea un monto (string numeric) en pesos mexicanos.
function formatearPrecio(monto: string): string {
  const n = Number(monto);
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)} MXN`;
}

export function ProductCard({
  nombre,
  vendedor,
  precio,
  precioComunidad,
  stockDisponible,
  tipo,
  imagenUrl,
}: ProductCardProps) {
  const agotado = stockDisponible === 0;
  const pocasUnidades =
    typeof stockDisponible === "number" && stockDisponible > 0 && stockDisponible <= 5;

  return (
    <Card className="group cursor-pointer overflow-hidden rounded-xl border shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md">
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imagenUrl}
            alt={nombre}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          // Placeholder mientras no haya imagen subida
          <div className="flex h-full w-full items-center justify-center" aria-hidden>
            <ShoppingBag className="h-8 w-8 text-muted-foreground/40" />
          </div>
        )}

        {/* Badges de tipo y disponibilidad flotantes sobre la imagen */}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {tipo === "drop" && <Badge className="bg-primary">Drop</Badge>}
          {tipo === "preventa" && <Badge variant="secondary">Preventa</Badge>}
          {agotado && (
            <Badge className="border-transparent bg-foreground/80 text-background backdrop-blur">
              Agotado
            </Badge>
          )}
        </div>
      </div>

      <CardContent className="space-y-1 p-3 pb-0">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{nombre}</h3>
        <p className="text-xs text-muted-foreground">{vendedor}</p>
        {pocasUnidades && (
          <p className="text-xs font-medium text-warning">{`Quedan ${stockDisponible}`}</p>
        )}
      </CardContent>

      <CardFooter className="flex flex-col items-start gap-0.5 p-3 pt-1">
        <span className="font-heading text-base font-semibold tracking-tight">
          {formatearPrecio(precio)}
        </span>
        {precioComunidad != null && (
          <span className="text-xs font-medium text-success">
            {`Comunidad: ${formatearPrecio(precioComunidad)}`}
          </span>
        )}
      </CardFooter>
    </Card>
  );
}
