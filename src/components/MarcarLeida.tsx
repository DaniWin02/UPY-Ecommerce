"use client";

// Marca la conversación como leída al montar el hilo y refresca el RSC padre
// para que los contadores de no-leídos del shell se actualicen al instante.
// No renderiza nada: es un efecto colateral controlado.
import * as React from "react";
import { useRouter } from "next/navigation";
import { accionMarcarLeida } from "@/app/mensajes/actions";

export function MarcarLeida({ conversationId }: { conversationId: string }) {
  const router = useRouter();

  React.useEffect(() => {
    let cancelado = false;

    accionMarcarLeida(conversationId)
      .then(() => {
        // refresh() tras resolver: los contadores ya cambiaron en BD.
        if (!cancelado) router.refresh();
      })
      .catch(() => {
        // Silencioso: perder un "leído" no debe romper el hilo.
      });

    return () => {
      cancelado = true; // evita refresh tras desmontar o cambiar de chat
    };
  }, [conversationId, router]);

  return null;
}
