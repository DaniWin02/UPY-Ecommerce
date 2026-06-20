"use client";

import { Badge } from "@/components/ui/badge";

export interface DropCountdownProps {
  /** Momento en que inicia el drop */
  inicia: Date | string;
  /** Momento en que termina el drop */
  termina: Date | string;
}

// TODO: realtime — calcular el tiempo restante con un intervalo (useEffect + setInterval)
// y exponer estados: "por_iniciar" | "activo" | "finalizado".
export function DropCountdown({ inicia, termina }: DropCountdownProps) {
  // TODO: parsear fechas y derivar días/horas/minutos/segundos restantes
  void inicia;
  void termina;

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border p-4">
      <Badge variant="destructive">Drop</Badge>
      <div className="flex items-center gap-2 font-mono text-2xl tabular-nums">
        {/* TODO: reemplazar con los segmentos reales del contador */}
        <span>00</span>:<span>00</span>:<span>00</span>:<span>00</span>
      </div>
      <p className="text-xs text-muted-foreground">Días : Horas : Min : Seg</p>
    </div>
  );
}
