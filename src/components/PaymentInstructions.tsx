"use client";

import * as React from "react";
import {
  AlertTriangle,
  Banknote,
  Check,
  Copy,
  Info,
  Landmark,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export interface PaymentInstructionsProps {
  /** Método de pago del pedido. */
  metodo: "spei" | "efectivo";
  /** CLABE interbancaria del vendor (null si aún no la registra). */
  clabe: string | null;
  /** Referencia única del pedido: va como concepto del SPEI. */
  referencia: string;
  /** Total del pedido en MXN (string numeric de la BD). */
  monto: string;
  /** Aula/punto de entrega (para el mensaje de efectivo). */
  aula: string | null;
}

// Formato de moneda MXN (es-MX): $1,250.00.
function formatearMXN(monto: string): string {
  const n = Number(monto);
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(Number.isFinite(n) ? n : 0);
}

// Fila con valor en mono + botón de copiar (icono) con feedback Check 2 s.
function FilaCopiable({
  etiqueta,
  valorMostrado,
  valorCopiable,
}: {
  etiqueta: string;
  /** Cómo se ve (p. ej. CLABE agrupada de 4 en 4). */
  valorMostrado: string;
  /** Lo que va al portapapeles (SIN espacios). */
  valorCopiable: string;
}) {
  const [copiado, setCopiado] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valorCopiable);
    } catch {
      // Fallback para contextos sin Clipboard API (http, WebViews viejos):
      // textarea temporal + execCommand("copy").
      try {
        const ta = document.createElement("textarea");
        ta.value = valorCopiable;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        return; // No hay forma de copiar: no mostramos feedback falso.
      }
    }
    setCopiado(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {etiqueta}
        </p>
        <p className="truncate font-mono text-base tabular-nums tracking-wide">
          {valorMostrado}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={copiar}
        aria-label={copiado ? `${etiqueta} copiada` : `Copiar ${etiqueta}`}
        className="shrink-0 transition-colors"
      >
        {copiado ? (
          <Check className="h-4 w-4 text-success" aria-hidden />
        ) : (
          <Copy className="h-4 w-4" aria-hidden />
        )}
      </Button>
    </div>
  );
}

export function PaymentInstructions({
  metodo,
  clabe,
  referencia,
  monto,
  aula,
}: PaymentInstructionsProps) {
  const montoFormateado = formatearMXN(monto);

  // Efectivo: sin CLABE ni referencia; se paga al recoger.
  if (metodo === "efectivo") {
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Banknote className="h-4 w-4" aria-hidden />
            </span>
            <div className="space-y-1 text-sm">
              <p>
                Pagarás{" "}
                <span className="font-heading font-semibold tabular-nums">
                  {montoFormateado}
                </span>{" "}
                en efectivo al recoger.
              </p>
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="font-medium text-foreground">
                  {aula ?? "Punto de entrega por acordar"}
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // SPEI sin CLABE registrada: no hay a dónde transferir todavía.
  if (!clabe) {
    return (
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="font-medium">
              La tienda aún no registra su CLABE; contáctala para completar el pago.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // CLABE sin espacios para copiar; agrupada de 4 en 4 para leerla cómodo.
  const clabeLimpia = clabe.replace(/\s+/g, "");
  const clabeAgrupada = clabeLimpia.match(/.{1,4}/g)?.join(" ") ?? clabeLimpia;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Landmark className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h3 className="font-heading text-sm font-semibold tracking-tight">
              Paga por SPEI
            </h3>
            <p className="text-xs text-muted-foreground">
              Desde tu app bancaria
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <FilaCopiable
          etiqueta="CLABE"
          valorMostrado={clabeAgrupada}
          valorCopiable={clabeLimpia}
        />
        <FilaCopiable
          etiqueta="Referencia / concepto"
          valorMostrado={referencia}
          valorCopiable={referencia}
        />

        <div className="rounded-lg bg-muted p-3 text-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Transfiere exactamente
          </p>
          <p className="mt-1 font-heading text-2xl font-bold tabular-nums tracking-tight">
            {montoFormateado}
          </p>
        </div>

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Transfiere el monto exacto y usa la referencia como concepto — así te
            verificamos rápido.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
