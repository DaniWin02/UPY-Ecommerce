import { cn } from "@/lib/utils";

// Estados posibles de un pedido, en orden cronológico
export type EstadoPedido =
  | "pendiente_pago"
  | "comprobante_enviado"
  | "pago_verificado"
  | "preparando"
  | "listo_entrega"
  | "entregado";

const PASOS: { estado: EstadoPedido; etiqueta: string }[] = [
  { estado: "pendiente_pago", etiqueta: "Pendiente de pago" },
  { estado: "comprobante_enviado", etiqueta: "Comprobante enviado" },
  { estado: "pago_verificado", etiqueta: "Pago verificado" },
  { estado: "preparando", etiqueta: "Preparando" },
  { estado: "listo_entrega", etiqueta: "Listo para entrega" },
  { estado: "entregado", etiqueta: "Entregado" },
];

export interface OrderTimelineProps {
  /** Estado actual del pedido */
  estadoActual: EstadoPedido;
}

export function OrderTimeline({ estadoActual }: OrderTimelineProps) {
  // TODO: marcar timestamps por paso y resaltar estados de error (p. ej. pago rechazado)
  const indiceActual = PASOS.findIndex((p) => p.estado === estadoActual);

  return (
    <ol className="space-y-4">
      {PASOS.map((paso, i) => {
        const completado = i <= indiceActual;
        const esActual = i === indiceActual;
        return (
          <li key={paso.estado} className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs",
                completado ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 text-muted-foreground"
              )}
            >
              {i + 1}
            </span>
            <span className={cn("text-sm", esActual ? "font-semibold" : completado ? "text-foreground" : "text-muted-foreground")}>
              {paso.etiqueta}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
