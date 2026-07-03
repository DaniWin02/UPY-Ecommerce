// Checkout por tienda (Fase 5): una sola página mobile-first, un solo <form>
// con server action — funciona sin JS en el cliente. Se llega desde /carrito
// con ?tienda=slug porque cada vendedor cobra a su propia CLABE.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { leerCarrito, resolverCarrito, type LineaCarrito } from "@/lib/cart";
import { confirmarPedido } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const metadata: Metadata = { title: "Confirmar pedido" };

// Los montos llegan como numeric-string de Postgres; Number solo para formatear.
const formatoMXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

// Mensajes de los códigos de error que devuelve la server action por query.
const MENSAJES_ERROR: Record<string, string> = {
  StockCambio: "El stock cambió mientras comprabas; revisa tu carrito.",
  SinStock: "Alguien ganó el último; revisa tu carrito.",
  NoSePudo: "No pudimos crear tu pedido. Inténtalo de nuevo en un momento.",
  Validacion: "Algo no cuadró con el formulario. Vuelve a intentarlo.",
};

// Talla/color en una sola línea compacta: "M · Rojo".
function textoAtributos(linea: LineaCarrito): string | null {
  if (!linea.atributos) return null;
  const partes = [linea.atributos.talla, linea.atributos.color].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : null;
}

// Estilo compartido de las radio-cards: el borde se pinta con :has(:checked).
const radioCard =
  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ tienda?: string; error?: string }>;
}) {
  // El checkout exige sesión: la orden necesita compradorId.
  await requireUser();

  const { tienda, error } = await searchParams;
  if (!tienda) redirect("/carrito");

  // Grupo de ESTA tienda; si ya no hay líneas (p. ej. tras comprar), al carrito.
  const items = await leerCarrito();
  const carrito = await resolverCarrito(items);
  const grupo = carrito.grupos.find((g) => g.vendor.slug === tienda);
  if (!grupo || grupo.lineas.length === 0) redirect("/carrito");

  const mensajeError = error ? MENSAJES_ERROR[error] ?? MENSAJES_ERROR.NoSePudo : null;

  return (
    <main className="mx-auto max-w-lg space-y-4 p-4 pb-24">
      {/* 1. Encabezado */}
      <header className="space-y-0.5">
        <h1 className="text-xl font-bold">Confirmar pedido</h1>
        <p className="text-sm text-muted-foreground">
          Tienda:{" "}
          <Link
            href={`/tienda/${grupo.vendor.slug}`}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            {grupo.vendor.nombre}
          </Link>
        </p>
      </header>

      {/* 2. Banner de error (viene por query desde la server action) */}
      {mensajeError && (
        <div
          role="alert"
          className="space-y-1 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <p>{mensajeError}</p>
          <Link href="/carrito" className="font-medium underline underline-offset-2">
            Volver al carrito
          </Link>
        </div>
      )}

      {/* 3. Resumen del pedido */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold">Resumen</h2>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {grupo.lineas.map((linea) => {
              const atributos = textoAtributos(linea);
              return (
                <li
                  key={linea.variantId}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="min-w-0">
                    <span className="tabular-nums">{linea.qty} ×</span> {linea.nombre}
                    {atributos && (
                      <span className="text-muted-foreground"> ({atributos})</span>
                    )}
                  </span>
                  <span className="flex-none tabular-nums">
                    {formatoMXN.format(Number(linea.subtotal))}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-baseline justify-between border-t pt-3 font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatoMXN.format(Number(grupo.subtotal))}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Los precios se congelan al confirmar.
          </p>
        </CardContent>
      </Card>

      {/* 4. Un solo form: entrega + pago + confirmar */}
      <form action={confirmarPedido} className="space-y-4">
        <input type="hidden" name="tienda" value={grupo.vendor.slug} />

        {/* Entrega */}
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">Entrega</legend>

          <label className={radioCard}>
            <input
              type="radio"
              name="metodoEntrega"
              value="aula"
              defaultChecked
              className="peer mt-1 accent-primary"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">📍 Aula del vendedor</span>
              <span className="block text-xs text-muted-foreground">
                {grupo.vendor.aulaDefault ?? "por confirmar"}
              </span>
            </span>
          </label>

          <label className={radioCard}>
            <input
              type="radio"
              name="metodoEntrega"
              value="punto"
              className="peer mt-1 accent-primary"
            />
            <span className="min-w-0 flex-1 space-y-2">
              <span className="block text-sm font-medium">🏫 Punto de entrega</span>
              <Input
                type="text"
                name="punto"
                placeholder="¿Dónde? (ej. Cafetería)"
                className="text-sm"
              />
            </span>
          </label>
        </fieldset>

        {/* Pago */}
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">Pago</legend>

          <label className={radioCard}>
            <input
              type="radio"
              name="metodoPago"
              value="spei"
              defaultChecked
              className="peer mt-1 accent-primary"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">🏦 Transferencia SPEI</span>
              <span className="block text-xs text-muted-foreground">
                Te damos CLABE y referencia al confirmar
              </span>
            </span>
          </label>

          <label className={radioCard}>
            <input
              type="radio"
              name="metodoPago"
              value="efectivo"
              className="peer mt-1 accent-primary"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">💵 Efectivo al recoger</span>
              <span className="block text-xs text-muted-foreground">Pagas al recibir</span>
            </span>
          </label>
        </fieldset>

        {/* Confirmar */}
        <div className="space-y-2">
          <Button type="submit" size="lg" className="w-full">
            Confirmar pedido
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Se reservará tu stock por 48 horas.
          </p>
        </div>
      </form>
    </main>
  );
}
