"use server";

// Server action del checkout (Fase 5): valida el formulario, crea la orden
// POR tienda con crearOrden y quita del carrito SOLO las líneas de esa tienda.
// Los redirect van FUERA de try/catch: redirect() lanza NEXT_REDIRECT y un
// catch genérico se lo tragaría (patrón del repo).

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { leerCarrito, escribirCarrito, resolverCarrito } from "@/lib/cart";
import { crearOrden } from "@/lib/orders";

// Uniones válidas del formulario: cualquier otro valor es manipulación o bug.
const METODOS_PAGO = ["spei", "efectivo"] as const;
const METODOS_ENTREGA = ["aula", "punto"] as const;
type MetodoPago = (typeof METODOS_PAGO)[number];
type MetodoEntrega = (typeof METODOS_ENTREGA)[number];

export async function confirmarPedido(formData: FormData): Promise<void> {
  const user = await requireUser();

  const slug = String(formData.get("tienda") ?? "").trim();
  if (!slug) redirect("/carrito");

  const metodoPagoRaw = String(formData.get("metodoPago") ?? "");
  const metodoEntregaRaw = String(formData.get("metodoEntrega") ?? "");
  const punto = String(formData.get("punto") ?? "").trim();
  const aulaCampo = String(formData.get("aula") ?? "").trim();

  // Validación contra las uniones (los radios podrían venir alterados).
  if (
    !(METODOS_PAGO as readonly string[]).includes(metodoPagoRaw) ||
    !(METODOS_ENTREGA as readonly string[]).includes(metodoEntregaRaw)
  ) {
    redirect(`/checkout?tienda=${encodeURIComponent(slug)}&error=Validacion`);
  }
  const metodoPago = metodoPagoRaw as MetodoPago;
  const metodoEntrega = metodoEntregaRaw as MetodoEntrega;

  // Carrito fresco: el grupo de ESTA tienda es lo único que se compra aquí.
  const items = await leerCarrito();
  const carrito = await resolverCarrito(items);
  const grupo = carrito.grupos.find((g) => g.vendor.slug === slug);
  if (!grupo || grupo.lineas.length === 0) redirect("/carrito");

  // El stock pudo bajar entre carrito y checkout: avisar antes de intentar.
  if (grupo.lineas.some((linea) => linea.qty > linea.disponible)) {
    redirect(`/checkout?tienda=${encodeURIComponent(slug)}&error=StockCambio`);
  }

  // Lugar de entrega: punto elegido por el comprador (con texto genérico si
  // lo dejó vacío) o el aula del vendedor por defecto.
  const aula =
    metodoEntrega === "punto"
      ? punto || "Punto de entrega del campus"
      : aulaCampo || grupo.vendor.aulaDefault || undefined;

  // crearOrden dentro de try/catch (fallos de red/DB); los redirect, fuera.
  let resultado: Awaited<ReturnType<typeof crearOrden>>;
  try {
    resultado = await crearOrden({
      compradorId: user.id,
      vendorId: grupo.vendor.id,
      items: grupo.lineas.map((linea) => ({ variantId: linea.variantId, qty: linea.qty })),
      metodoPago,
      metodoEntrega,
      aula,
    });
  } catch {
    resultado = { ok: false, error: "NO_SE_PUDO" };
  }

  if (!resultado.ok) {
    const codigo = resultado.error === "SIN_STOCK" ? "SinStock" : "NoSePudo";
    redirect(`/checkout?tienda=${encodeURIComponent(slug)}&error=${codigo}`);
  }

  // Éxito: quitar del carrito SOLO las variantes de esta tienda; el resto
  // de grupos sigue disponible para su propio checkout.
  const compradas = new Set(grupo.lineas.map((linea) => linea.variantId));
  const restante = (await leerCarrito()).filter((item) => !compradas.has(item.variantId));
  await escribirCarrito(restante);

  redirect(`/pedidos/${resultado.orderId}`);
}
