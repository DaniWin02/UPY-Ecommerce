"use server";

// Server actions DELGADAS del panel de pedidos/comprobantes del vendedor.
// Solo validan el FormData, resuelven el actor de la sesión y delegan en el
// dominio (src/lib/orders), que RE-VERIFICA en BD que el actor pertenezca al
// vendor de la orden (doble capa: sesión aquí + permisos en el dominio).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireVendorMember } from "@/lib/session";
import {
  verificarPago,
  rechazarPago,
  confirmarEfectivo,
  avanzarEstado,
} from "@/lib/orders";

// ---------------------------------------------------------------------------
// Schemas Zod (sin export: un módulo "use server" solo exporta funciones async)
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

// Motivo opcional del rechazo: textarea vacía ("") → undefined.
const motivoSchema = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === "" ? undefined : v));

// Únicos avances de estado permitidos desde el panel (valida contra la unión
// del contrato de avanzarEstado; el dominio valida además la transición real).
const nuevoEstadoSchema = z.enum(["preparando", "listo_entrega", "entregado"]);

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

// Cualquier cambio de pago/estado afecta a ambas vistas del panel.
function revalidarPanel() {
  revalidatePath("/vendor/comprobantes");
  revalidatePath("/vendor/pedidos");
}

// Destino con banner: ?ok=1 si salió bien, ?error=<código> si no.
function destinoConResultado(base: string, resultado: { ok: boolean; error?: string }) {
  if (resultado.ok) return `${base}?ok=1`;
  return `${base}?error=${encodeURIComponent(resultado.error ?? "Desconocido")}`;
}

// ---------------------------------------------------------------------------
// Acciones
// ---------------------------------------------------------------------------

/** Aprueba un comprobante SPEI (payments.estado enviado → verificado). */
export async function accionVerificarPago(formData: FormData) {
  const { user } = await requireVendorMember();

  const paymentId = uuidSchema.safeParse(formData.get("paymentId"));
  if (!paymentId.success) redirect("/vendor/comprobantes?error=Validacion");

  // El dominio re-verifica que user.id pertenezca al vendor de la orden.
  const resultado = await verificarPago(paymentId.data, user.id);

  revalidarPanel();
  // redirect() lanza excepción: SIEMPRE fuera de try/catch.
  redirect(destinoConResultado("/vendor/comprobantes", resultado));
}

/** Rechaza un comprobante SPEI con motivo opcional (se muestra al comprador). */
export async function accionRechazarPago(formData: FormData) {
  const { user } = await requireVendorMember();

  const paymentId = uuidSchema.safeParse(formData.get("paymentId"));
  const motivo = motivoSchema.safeParse(formData.get("motivo") ?? "");
  if (!paymentId.success || !motivo.success) {
    redirect("/vendor/comprobantes?error=Validacion");
  }

  const resultado = await rechazarPago(paymentId.data, user.id, motivo.data);

  revalidarPanel();
  redirect(destinoConResultado("/vendor/comprobantes", resultado));
}

/** Confirma un pago en efectivo recibido en mano (confirma Y descuenta stock). */
export async function accionConfirmarEfectivo(formData: FormData) {
  const { user } = await requireVendorMember();

  const orderId = uuidSchema.safeParse(formData.get("orderId"));
  if (!orderId.success) redirect("/vendor/pedidos?error=Validacion");

  const resultado = await confirmarEfectivo(orderId.data, user.id);

  revalidarPanel();
  redirect(destinoConResultado("/vendor/pedidos", resultado));
}

/** Avanza la orden por la máquina de estados (preparando → listo → entregado). */
export async function accionAvanzarEstado(formData: FormData) {
  const { user } = await requireVendorMember();

  const orderId = uuidSchema.safeParse(formData.get("orderId"));
  const nuevo = nuevoEstadoSchema.safeParse(formData.get("nuevo"));
  if (!orderId.success || !nuevo.success) {
    redirect("/vendor/pedidos?error=Validacion");
  }

  const resultado = await avanzarEstado(orderId.data, user.id, nuevo.data);

  revalidarPanel();
  redirect(destinoConResultado("/vendor/pedidos", resultado));
}

// Fin de las acciones de pedidos/comprobantes del vendedor.
