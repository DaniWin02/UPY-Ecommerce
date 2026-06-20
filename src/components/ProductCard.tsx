import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Estado de disponibilidad del producto
type EstadoProducto = "disponible" | "agotado" | "drop" | "proximamente";

export interface ProductCardProps {
  nombre: string;
  vendedor: string;
  precio: number;
  precioComunidad?: number;
  imagenUrl?: string;
  estado?: EstadoProducto;
  /** Cantidad disponible en inventario */
  stock?: number;
  onClick?: () => void;
}

// Formatea un monto en pesos mexicanos
function formatearPrecio(monto: number): string {
  // TODO: usar Intl.NumberFormat con configuración centralizada
  return `$${monto.toFixed(2)} MXN`;
}

export function ProductCard({
  nombre,
  vendedor,
  precio,
  precioComunidad,
  imagenUrl,
  estado = "disponible",
  stock,
}: ProductCardProps) {
  // TODO: enlazar a la página de detalle del producto y manejar imagen optimizada
  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-square w-full bg-muted">
        {imagenUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagenUrl} alt={nombre} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            {/* TODO: placeholder de imagen */}
            Sin imagen
          </div>
        )}
        {estado === "drop" && (
          <Badge variant="destructive" className="absolute left-2 top-2">
            Drop
          </Badge>
        )}
        {estado === "agotado" && (
          <Badge variant="secondary" className="absolute left-2 top-2">
            Agotado
          </Badge>
        )}
      </div>

      <CardContent className="space-y-1 pt-4">
        <h3 className="line-clamp-2 text-sm font-medium">{nombre}</h3>
        <p className="text-xs text-muted-foreground">{vendedor}</p>
        {typeof stock === "number" && stock <= 5 && stock > 0 && (
          <p className="text-xs text-amber-600">{`Quedan ${stock}`}</p>
        )}
      </CardContent>

      <CardFooter className="flex flex-col items-start gap-0.5">
        <span className="text-base font-semibold">{formatearPrecio(precio)}</span>
        {typeof precioComunidad === "number" && (
          <span className="text-xs text-emerald-600">
            {`Precio comunidad: ${formatearPrecio(precioComunidad)}`}
          </span>
        )}
      </CardFooter>
    </Card>
  );
}
