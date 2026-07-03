"use server";

// Server actions DELGADAS de mensajería: validan el FormData, resuelven el
// actor de sesión y delegan en el dominio (@/lib/messaging), que re-verifica
// permisos y bloqueos en BD. Los redirect van FUERA de try/catch: redirect()
// lanza NEXT_REDIRECT y un catch genérico se lo tragaría (patrón del repo).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema/products";
import { orders } from "@/db/schema/orders";
import { requireUser, getSessionUser } from "@/lib/session";
import {
  abrirConversacion,
  enviarMensaje,
  marcarLeida,
  reportarConversacion,
  bloquearUsuario,
} from "@/lib/messaging";

// ---------------------------------------------------------------------------
// Schemas Zod (sin export: un módulo "use server" solo exporta funciones async)
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();
const cuerpoSchema = z.string().trim().min(1).max(2000);
const motivoSchema = z.string().trim().min(1).max(500);

// ---------------------------------------------------------------------------
// Abrir conversación
// ---------------------------------------------------------------------------

/** Abre (o reutiliza) la conversación comprador↔tienda desde un producto. */
export async function accionAbrirDesdeProducto(formData: FormData) {
  const user = await requireUser();

  const productId = uuidSchema.safeParse(formData.get("productId"));
  if (!productId.success) redirect("/mensajes?error=Validacion");

  // Resolver la tienda dueña del producto (el dominio no recibe productos sueltos).
  const [producto] = await db
    .select({ vendorId: products.vendorId })
    .from(products)
    .where(eq(products.id, productId.data))
    .limit(1);
  if (!producto) redirect("/mensajes?error=NoSePudo");

  // Unión con el fallback del catch: el error del dominio puede ser un literal.
  let resultado: Awaited<ReturnType<typeof abrirConversacion>> | { ok: false; error: string };
  try {
    resultado = await abrirConversacion({
      compradorId: user.id,
      vendorId: producto.vendorId,
      productId: productId.data,
    });
  } catch {
    resultado = { ok: false, error: "NO_SE_PUDO" };
  }

  if (resultado.ok) redirect(`/mensajes/${resultado.conversationId}`);
  if (resultado.error === "BLOQUEADO") redirect("/mensajes?error=Bloqueado");
  redirect(
    `/producto/${productId.data}?error=${encodeURIComponent(resultado.error ?? "NoSePudo")}`
  );
}

/** Abre (o reutiliza) la conversación con la tienda de un pedido DEL usuario. */
export async function accionAbrirDesdeOrden(formData: FormData) {
  const user = await requireUser();

  const orderId = uuidSchema.safeParse(formData.get("orderId"));
  if (!orderId.success) redirect("/mensajes?error=Validacion");

  // La orden debe existir Y pertenecer al usuario de la sesión (anti-IDOR).
  const [orden] = await db
    .select({ vendorId: orders.vendorId, compradorId: orders.compradorId })
    .from(orders)
    .where(eq(orders.id, orderId.data))
    .limit(1);
  if (!orden || orden.compradorId !== user.id) redirect("/pedidos");

  let resultado: Awaited<ReturnType<typeof abrirConversacion>> | { ok: false; error: string };
  try {
    resultado = await abrirConversacion({
      compradorId: user.id,
      vendorId: orden.vendorId,
      orderId: orderId.data,
    });
  } catch {
    resultado = { ok: false, error: "NO_SE_PUDO" };
  }

  if (resultado.ok) redirect(`/mensajes/${resultado.conversationId}`);
  if (resultado.error === "BLOQUEADO") redirect("/mensajes?error=Bloqueado");
  redirect(
    `/pedidos/${orderId.data}?error=${encodeURIComponent(resultado.error ?? "NoSePudo")}`
  );
}

// ---------------------------------------------------------------------------
// Mensajes
// ---------------------------------------------------------------------------

/** Envía un mensaje en una conversación (el dominio valida la pertenencia). */
export async function accionEnviarMensaje(formData: FormData) {
  const user = await requireUser();

  const conversationId = uuidSchema.safeParse(formData.get("conversationId"));
  if (!conversationId.success) redirect("/mensajes?error=Validacion");

  const cuerpo = cuerpoSchema.safeParse(formData.get("cuerpo"));
  if (!cuerpo.success) {
    redirect(`/mensajes/${conversationId.data}?error=Validacion`);
  }

  let resultado: Awaited<ReturnType<typeof enviarMensaje>> | { ok: false; error: string };
  try {
    resultado = await enviarMensaje(conversationId.data, user.id, cuerpo.data);
  } catch {
    resultado = { ok: false, error: "NO_SE_PUDO" };
  }

  revalidatePath(`/mensajes/${conversationId.data}`);
  if (resultado.ok) redirect(`/mensajes/${conversationId.data}`);
  redirect(
    `/mensajes/${conversationId.data}?error=${encodeURIComponent(resultado.error ?? "NoSePudo")}`
  );
}

/**
 * Marca la conversación como leída para el usuario actual.
 * Se invoca desde el cliente (<MarcarLeida />): sin redirect y silenciosa
 * ante fallos (perder un "leído" no debe romper la pantalla).
 */
export async function accionMarcarLeida(conversationId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;

  const parsed = uuidSchema.safeParse(conversationId);
  if (!parsed.success) return;

  try {
    await marcarLeida(parsed.data, user.id);
  } catch {
    // Silencioso a propósito: el polling reintentará en el siguiente ciclo.
  }
}

// ---------------------------------------------------------------------------
// Moderación
// ---------------------------------------------------------------------------

/** Reporta la conversación a la administración con un motivo obligatorio. */
export async function accionReportar(formData: FormData) {
  const user = await requireUser();

  const conversationId = uuidSchema.safeParse(formData.get("conversationId"));
  if (!conversationId.success) redirect("/mensajes?error=Validacion");

  const motivo = motivoSchema.safeParse(formData.get("motivo"));
  if (!motivo.success) {
    redirect(`/mensajes/${conversationId.data}?error=Validacion`);
  }

  let resultado: Awaited<ReturnType<typeof reportarConversacion>> | { ok: false; error: string };
  try {
    resultado = await reportarConversacion(user.id, conversationId.data, motivo.data);
  } catch {
    resultado = { ok: false, error: "NO_SE_PUDO" };
  }

  if (resultado.ok) redirect(`/mensajes/${conversationId.data}?reportado=1`);
  redirect(
    `/mensajes/${conversationId.data}?error=${encodeURIComponent(resultado.error ?? "NoSePudo")}`
  );
}

/** Bloquea al otro usuario de la conversación y vuelve a la bandeja. */
export async function accionBloquear(formData: FormData) {
  const user = await requireUser();

  const blockedId = uuidSchema.safeParse(formData.get("blockedId"));
  if (!blockedId.success) redirect("/mensajes?error=Validacion");

  let resultado: Awaited<ReturnType<typeof bloquearUsuario>> | { ok: false; error: string };
  try {
    resultado = await bloquearUsuario(user.id, blockedId.data);
  } catch {
    resultado = { ok: false, error: "NO_SE_PUDO" };
  }

  revalidatePath("/mensajes");
  if (resultado.ok) redirect("/mensajes");
  redirect(`/mensajes?error=${encodeURIComponent(resultado.error ?? "NoSePudo")}`);
}

// Fin de las acciones de mensajería.
