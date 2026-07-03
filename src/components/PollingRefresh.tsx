"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

export interface PollingRefreshProps {
  /** Solo hace polling si el pedido sigue "vivo" (estado no terminal). */
  activo: boolean;
  /** Intervalo entre refresh; 30 s por defecto. */
  intervaloMs?: number;
}

// Polling ligero para el hub del pedido: refresca los datos del RSC padre
// (router.refresh() NO pierde el estado de los componentes cliente).
export function PollingRefresh({ activo, intervaloMs = 30000 }: PollingRefreshProps) {
  const router = useRouter();

  React.useEffect(() => {
    if (!activo) return;
    const id = setInterval(() => router.refresh(), intervaloMs);
    return () => clearInterval(id); // limpiar al desmontar o cambiar props
  }, [activo, intervaloMs, router]);

  return null;
}
