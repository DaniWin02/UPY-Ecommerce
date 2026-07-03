import { GraduationCap, Rocket, Users, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Tipo de vendedor dentro del marketplace universitario
export type TipoVendedor = "facultad" | "club" | "emprendimiento";

export interface VendorBadgeProps {
  tipo: TipoVendedor;
  className?: string;
}

// Etiqueta, icono y tonos suaves del tema por tipo de vendedor (sin colores duros).
const ESTILOS: Record<TipoVendedor, { etiqueta: string; Icono: LucideIcon; clases: string }> = {
  facultad: {
    etiqueta: "Facultad",
    Icono: GraduationCap,
    clases: "border-primary/20 bg-primary/10 text-primary",
  },
  club: {
    etiqueta: "Club",
    Icono: Users,
    clases: "border-success/20 bg-success/10 text-success",
  },
  emprendimiento: {
    etiqueta: "Emprendimiento",
    Icono: Rocket,
    clases: "border-accent-foreground/20 bg-accent text-accent-foreground",
  },
};

export function VendorBadge({ tipo, className }: VendorBadgeProps) {
  const { etiqueta, Icono, clases } = ESTILOS[tipo];
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", clases, className)}>
      <Icono className="h-3 w-3" aria-hidden />
      {etiqueta}
    </Badge>
  );
}
