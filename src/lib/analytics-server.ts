// analytics-server.ts — emisión SERVER-SIDE de eventos de negocio (Fase 6).
//
// Los eventos del funnel que representan dinero o intención firme de compra
// (add_carrito, orden_creada, pago_verificado) se emiten desde el servidor:
// son más fiables que el tracking del cliente (adblockers, pestañas cerradas).
//
// CONTRATO CRÍTICO (mismo patrón que notificar() en src/lib/notifications.ts):
// registrarEvento NUNCA lanza. Un evento de analítica fallido JAMÁS rompe una
// transición de negocio; se llama SIEMPRE fuera de la transacción y el fallo
// se registra en consola.
import { db } from "@/db";
import { analyticsEvents } from "@/db/schema";

/** Evento de negocio emitido desde el servidor (subset del funnel). */
export type EventoServidor = {
  tipo: "add_carrito" | "orden_creada" | "pago_verificado";
  userId?: string | null;
  sessionId?: string | null;
  vendorId?: string | null;
  productId?: string | null;
  orderId?: string | null;
  ruta?: string;
  metadata?: Record<string, unknown>;
};

/**
 * registrarEvento — INSERT append-only en analytics_events.
 *
 * - sessionId por defecto "server": los eventos de negocio no siempre tienen
 *   la cookie de sesión anónima a mano (jobs, actions sin request de tienda).
 * - ruta por defecto "/" y device "desconocido" (no hay user-agent fiable).
 * - try/catch interno con console.error: analítica jamás rompe el negocio.
 */
export async function registrarEvento(e: EventoServidor): Promise<void> {
  try {
    await db.insert(analyticsEvents).values({
      eventType: e.tipo,
      userId: e.userId ?? null,
      sessionId: e.sessionId ?? "server",
      vendorId: e.vendorId ?? null,
      productId: e.productId ?? null,
      orderId: e.orderId ?? null,
      ruta: e.ruta ?? "/",
      device: "desconocido",
      metadata: e.metadata ?? {},
    });
  } catch (error) {
    // Falla silenciosa deliberada: se loguea y la operación de negocio sigue.
    console.error(
      `[analytics] fallo al registrar evento tipo=${e.tipo} orderId=${e.orderId ?? "-"}:`,
      error,
    );
  }
}

// Fin de analytics-server.ts
