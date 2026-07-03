// notifications.ts — notificaciones in-app de Ágora (INSERT real en BD).
//
// Fase 5: la bandeja in-app es el ÚNICO canal activo. Correo (Resend) y
// WhatsApp quedan como TODOs comentados por decisión del equipo (sin Resend
// por ahora); cuando se activen, `notificar` los despachará además del INSERT.
import { db } from "@/db";
import { notifications } from "@/db/schema";

/** Tipos de notificación conocidos (informativo; la columna `tipo` es text). */
export type NotificationType =
  | "otp_login"
  | "orden_creada"
  | "comprobante_recibido"
  | "pago_verificado"
  | "pago_rechazado"
  | "orden_lista"
  | "orden_entregada"
  | "orden_expirada"
  | "drop_publicado";

/** Payload genérico de una notificación (depende del `tipo`). */
export type NotificationPayload = Record<string, unknown>;

/**
 * notificar — inserta una notificación in-app (leido = false) para el usuario.
 *
 * CONTRATO CRÍTICO: NUNCA lanza. Una notificación fallida no debe romper la
 * transición de orden/pago que la origina (por eso se llama SIEMPRE fuera de
 * la transacción y con try/catch interno; el fallo se registra en consola).
 */
export async function notificar(
  userId: string,
  tipo: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await db.insert(notifications).values({
      userId,
      tipo,
      payload,
      leido: false,
    });

    // TODO (canales externos, pendiente de decisión del equipo):
    // - Correo vía Resend:
    //     import { Resend } from "resend";
    //     const resend = new Resend(process.env.RESEND_API_KEY);
    //     await resend.emails.send({ from, to: emailDelUsuario, subject, html });
    //   (requiere resolver email del usuario y plantilla por `tipo`).
    // - WhatsApp (Meta Cloud API / Twilio) con plantillas aprobadas:
    //     await sendWhatsApp({ to: telefonoE164, mensaje });
  } catch (error) {
    // Falla silenciosa deliberada: se loguea y la operación de negocio sigue.
    console.error(
      `[notificaciones] fallo al notificar user=${userId} tipo=${tipo}:`,
      error,
    );
  }
}

// Fin de notifications.ts
