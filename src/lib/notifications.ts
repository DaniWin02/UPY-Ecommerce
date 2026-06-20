// notifications.ts — capa de notificaciones de Ágora por correo (Resend) y WhatsApp (STUB).

// TODO: descomentar cuando exista el cliente real.
// import { Resend } from "resend";
// const resend = new Resend(process.env.RESEND_API_KEY);

/** Tipos de notificación soportados. */
export type NotificationType =
  | "otp_login"
  | "orden_creada"
  | "comprobante_recibido"
  | "pago_verificado"
  | "pago_rechazado"
  | "orden_lista"
  | "orden_entregada"
  | "drop_publicado";

/** Payload genérico de una notificación (depende del `tipo`). */
export type NotificationPayload = Record<string, unknown>;

/** Parámetros para enviar un correo. */
export type EmailParams = {
  to: string;
  subject: string;
  /** Contenido HTML o texto plano. */
  html?: string;
  text?: string;
};

/** Parámetros para enviar un WhatsApp. */
export type WhatsAppParams = {
  /** Número en formato E.164, p. ej. +52155... */
  to: string;
  /** Plantilla o cuerpo del mensaje. */
  mensaje: string;
};

/**
 * sendEmail — envía un correo vía Resend.
 * TODO: implementar usando el cliente Resend y manejar errores/reintentos.
 */
export async function sendEmail(params: EmailParams): Promise<void> {
  // TODO: await resend.emails.send({ from, to: params.to, subject: params.subject, ... });
  void params;
}

/**
 * sendWhatsApp — envía un mensaje de WhatsApp.
 * TODO: integrar proveedor (Meta Cloud API / Twilio) y plantillas aprobadas.
 */
export async function sendWhatsApp(params: WhatsAppParams): Promise<void> {
  // TODO: llamar a la API del proveedor de WhatsApp.
  void params;
}

/**
 * notify — orquesta el envío de una notificación a un usuario según el `tipo`.
 * Resuelve los canales (correo/WhatsApp) y la plantilla a partir del payload.
 * TODO: cargar preferencias y datos de contacto del usuario; elegir canales.
 */
export async function notify(
  userId: string,
  tipo: NotificationType,
  payload: NotificationPayload,
): Promise<void> {
  // TODO: obtener email/teléfono del usuario `userId`.
  // TODO: renderizar plantilla según `tipo` y `payload`.
  // TODO: despachar por los canales habilitados (sendEmail / sendWhatsApp).
  void userId;
  void tipo;
  void payload;
}

// Fin de notifications.ts
