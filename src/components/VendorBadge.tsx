import { Badge } from "@/components/ui/badge";

// Tipo de vendedor dentro del marketplace universitario
export type TipoVendedor = "facultad" | "club" | "emprendimiento";

export interface VendorBadgeProps {
  tipo: TipoVendedor;
  className?: string;
}

const ETIQUETAS: Record<TipoVendedor, string> = {
  facultad: "Facultad",
  club: "Club",
  emprendimiento: "Emprendimiento",
};

export function VendorBadge({ tipo, className }: VendorBadgeProps) {
  // TODO: asignar color/icono distintivo por tipo de vendedor
  return (
    <Badge variant="secondary" className={className}>
      {ETIQUETAS[tipo]}
    </Badge>
  );
}
