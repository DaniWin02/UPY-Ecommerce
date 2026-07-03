"use client";

import * as React from "react";
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

// Fila con valor en mono + botón Copiar con feedback "¡Copiada!" durante 2 s.
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
    <div className="flex items-center justify-between gap-2 rounded-md border p-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{etiqueta}</p>
        <p className="truncate font-mono text-sm tracking-wide">{valorMostrado}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={copiar}>
        {copiado ? "¡Copiada!" : "Copiar"}
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
          <p className="text-sm">
            Pagarás <span className="font-semibold">{montoFormateado}</span> en
            efectivo al recoger en{" "}
            <span className="font-semibold">{aula ?? "el punto de entrega acordado"}</span>.
          </p>
        </CardContent>
      </Card>
    );
  }

  // SPEI sin CLABE registrada: no hay a dónde transferir todavía.
  if (!clabe) {
    return (
      <Card>
        <CardContent className="pt-4">
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
            La tienda aún no registra su CLABE; contáctala para completar el pago.
          </p>
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
        <h3 className="text-sm font-semibold">Paga por SPEI desde tu app bancaria</h3>
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

        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Monto exacto</p>
          <p className="text-2xl font-bold tabular-nums">{montoFormateado}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Transfiere el monto exacto y usa la referencia como concepto — así te
            verificamos rápido.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
