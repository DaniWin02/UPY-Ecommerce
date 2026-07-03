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
  /** Paso en rojo (comprobante rechazado). */
  error?: boolean;
};

// Camino feliz SPEI; el de efectivo omite "comprobante_enviado".
const PASOS_SPEI: Paso[] = [
  { estado: "pendiente_pago", etiqueta: "Pendiente de pago" },
  { estado: "comprobante_enviado", etiqueta: "Comprobante en revisión" },
  { estado: "pago_verificado", etiqueta: "Pago verificado" },
  { estado: "preparando", etiqueta: "Preparando" },
  { estado: "listo_entrega", etiqueta: "Listo para entrega" },
  { estado: "entregado", etiqueta: "Entregado" },
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
      etiqueta: "Comprobante rechazado — vuelve a subirlo",
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
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {estado === "expirado"
            ? "Este pedido expiró: la reserva de stock se liberó."
            : "Este pedido fue cancelado."}
        </div>
      )}

      <ol className={cn("space-y-0", cerrado && "opacity-50")}>
        {pasos.map((paso, i) => {
          const completado = indiceActual >= 0 && i < indiceActual;
          const esActual = i === indiceActual;
          const esUltimo = i === pasos.length - 1;

          return (
            <li key={paso.estado} className="flex gap-3">
              {/* Columna del círculo + línea conectora vertical */}
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    paso.error && esActual
                      ? "border-destructive bg-destructive/10 text-destructive ring-2 ring-destructive/30"
                      : completado
                        ? "border-transparent bg-success text-success-foreground"
                        : esActual
                          ? "border-primary text-primary ring-2 ring-primary/30"
                          : "border-muted-foreground/30 text-muted-foreground"
                  )}
                >
                  {completado ? "✓" : i + 1}
                </span>
                {!esUltimo && (
                  <span
                    aria-hidden
                    className={cn(
                      "min-h-5 w-px flex-1",
                      completado ? "bg-success" : "bg-border"
                    )}
                  />
                )}
              </div>

              <span
                className={cn(
                  "pb-5 pt-1 text-sm",
                  paso.error
                    ? "font-semibold text-destructive"
                    : esActual
                      ? "font-semibold text-foreground"
                      : completado
                        ? "text-foreground"
                        : "text-muted-foreground"
                )}
              >
                {paso.etiqueta}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
