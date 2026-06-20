"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export interface PaymentInstructionsProps {
  /** CLABE interbancaria de 18 dígitos para el SPEI */
  clabe: string;
  /** Referencia única del pedido */
  referencia: string;
  /** Monto a transferir en MXN */
  monto: number;
  /** Banco destino (opcional, informativo) */
  banco?: string;
  /** Permite pago en efectivo en punto de entrega */
  aceptaEfectivo?: boolean;
}

// TODO: usar navigator.clipboard.writeText y dar feedback visual (copiado!)
function copiar(texto: string) {
  void texto;
  // TODO: implementar copia al portapapeles
}

export function PaymentInstructions({
  clabe,
  referencia,
  monto,
  banco,
  aceptaEfectivo = false,
}: PaymentInstructionsProps) {
  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold">Instrucciones de pago (SPEI)</h3>
        <p className="text-xs text-muted-foreground">
          {/* TODO: formatear monto con Intl.NumberFormat */}
          {`Transfiere $${monto.toFixed(2)} MXN`}
          {banco ? ` · ${banco}` : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2 rounded-md border p-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">CLABE</p>
            <p className="truncate font-mono text-sm">{clabe}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => copiar(clabe)}>
            Copiar
          </Button>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-md border p-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Referencia</p>
            <p className="truncate font-mono text-sm">{referencia}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => copiar(referencia)}>
            Copiar
          </Button>
        </div>

        {aceptaEfectivo && (
          <p className="text-xs text-muted-foreground">
            {/* TODO: detallar puntos y horarios de pago en efectivo */}
            También puedes pagar en efectivo al momento de la entrega.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
