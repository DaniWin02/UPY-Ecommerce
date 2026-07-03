import {
  BadgeCheck,
  Check,
  CheckCircle2,
  Clock,
  Package,
  PackageCheck,
  ReceiptText,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Timeline vertical del pedido (server component: solo render, sin interacción).
// El camino feliz depende del método de pago: en SPEI existe el paso de
// comprobante; en efectivo se paga al recoger y ese paso se omite.

export interface OrderTimelineProps {
  /** Estado actual del pedido (enum order_estado de la BD). */
  estado: string;
  /** Método de pago: define si aparece el paso de comprobante. */
  metodo: "spei" | "efectivo";
}

type Paso = {
  estado: string;
  etiqueta: string;
  /** Sub-etiqueta descriptiva del paso. */
  detalle?: string;
  /** Icono lucide del paso. */
  icono: LucideIcon;
  /** Paso en rojo (comprobante rechazado). */
  error?: boolean;
};

// Camino feliz SPEI; el de efectivo omite "comprobante_enviado".
const PASOS_SPEI: Paso[] = [
  {
    estado: "pendiente_pago",
    etiqueta: "Pendiente de pago",
    detalle: "Realiza la transferencia o el pago",
    icono: Clock,
  },
  {
    estado: "comprobante_enviado",
    etiqueta: "Comprobante en revisión",
    detalle: "La tienda revisa tu comprobante",
    icono: ReceiptText,
  },
  {
    estado: "pago_verificado",
    etiqueta: "Pago verificado",
    detalle: "Tu pago quedó confirmado",
    icono: BadgeCheck,
  },
  {
    estado: "preparando",
    etiqueta: "Preparando",
    detalle: "La tienda alista tu pedido",
    icono: Package,
  },
  {
    estado: "listo_entrega",
    etiqueta: "Listo para entrega",
    detalle: "Pasa a recogerlo al punto acordado",
    icono: PackageCheck,
  },
  {
    estado: "entregado",
    etiqueta: "Entregado",
    detalle: "Pedido completado",
    icono: CheckCircle2,
  },
];

export function OrderTimeline({ estado, metodo }: OrderTimelineProps) {
  const pasos: Paso[] =
    metodo === "spei"
      ? [...PASOS_SPEI]
      : PASOS_SPEI.filter((p) => p.estado !== "comprobante_enviado");

  // "rechazado" no es parte de la línea feliz: ocupa la posición del paso de
  // comprobante como un paso de error en rojo (en efectivo, tras pendiente_pago).
  if (estado === "rechazado") {
    const pasoError: Paso = {
      estado: "rechazado",
      etiqueta: "Comprobante rechazado",
      detalle: "Vuelve a subirlo para continuar",
      icono: XCircle,
      error: true,
    };
    const idxComprobante = pasos.findIndex((p) => p.estado === "comprobante_enviado");
    if (idxComprobante >= 0) pasos[idxComprobante] = pasoError;
    else pasos.splice(1, 0, pasoError);
  }

  // Estados terminales fuera de la línea feliz: banner arriba y timeline atenuada.
  const cerrado = estado === "expirado" || estado === "cancelado";
  const indiceActual = cerrado ? -1 : pasos.findIndex((p) => p.estado === estado);

  return (
    <div>
      {cerrado && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="font-medium">
            {estado === "expirado"
              ? "Este pedido expiró: la reserva de stock se liberó."
              : "Este pedido fue cancelado."}
          </p>
        </div>
      )}

      <ol className={cn("space-y-0", cerrado && "opacity-50")}>
        {pasos.map((paso, i) => {
          const completado = indiceActual >= 0 && i < indiceActual;
          const esActual = i === indiceActual;
          const esUltimo = i === pasos.length - 1;
          const Icono = paso.icono;

          return (
            <li key={paso.estado} className="flex gap-3">
              {/* Columna del círculo + línea conectora vertical */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    paso.error && esActual
                      ? "border-2 border-destructive bg-destructive/5 text-destructive ring-4 ring-destructive/10"
                      : completado
                        ? "bg-success text-success-foreground"
                        : esActual
                          ? "border-2 border-primary bg-primary/5 text-primary ring-4 ring-primary/10"
                          : "border bg-background text-muted-foreground/50"
                  )}
                >
                  {completado ? (
                    <Check className="h-4 w-4" aria-hidden />
                  ) : (
                    <Icono className="h-4 w-4" aria-hidden />
                  )}
                </span>
                {!esUltimo && (
                  <span
                    aria-hidden
                    className={cn(
                      "min-h-5 w-px flex-1",
                      completado ? "bg-success/40" : "bg-border"
                    )}
                  />
                )}
              </div>

              <div className="pb-5 pt-1.5">
                <p
                  className={cn(
                    "text-sm",
                    paso.error
                      ? "font-medium text-destructive"
                      : esActual
                        ? "font-medium text-foreground"
                        : completado
                          ? "text-foreground"
                          : "text-muted-foreground"
                  )}
                >
                  {paso.etiqueta}
                </p>
                {paso.detalle && (esActual || paso.error) && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{paso.detalle}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
