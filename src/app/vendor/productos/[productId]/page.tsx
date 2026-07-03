// Panel vendedor — detalle de producto: edición, variantes y stock.
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Plus, Save } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products, productVariants, inventory } from "@/db/schema/products";
import { requireVendorMember } from "@/lib/session";
import {
  actualizarProducto,
  agregarVariante,
  actualizarStock,
} from "../actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

// Mensajes de los banners de error (?error=...).
const MENSAJES_ERROR: Record<string, string> = {
  Validacion:
    "Revisa los datos del formulario: hay campos inválidos o incompletos.",
  StockMenorQueReservado:
    "No puedes dejar el stock por debajo de lo ya reservado.",
};

export default async function EditarProductoPage({
  params,
  searchParams,
}: {
  // Next.js 15: params y searchParams son Promises en Server Components.
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { productId } = await params;
  const { error } = await searchParams;

  // DECISIÓN MVP: operamos sobre la PRIMERA membresía del usuario
  // (multi-tienda después); superadmin sin tienda → redirect("/").
  const { memberships } = await requireVendorMember();
  const vendor = memberships[0];
  if (!vendor) redirect("/");

  // Producto SOLO si pertenece al vendor de la sesión; si no, 404.
  const [producto] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.vendorId, vendor.vendorId)))
    .limit(1);
  if (!producto) notFound();

  // Variantes del producto con su inventario (stock/reservado).
  const variantes = await db
    .select({
      id: productVariants.id,
      sku: productVariants.sku,
      atributos: productVariants.atributos,
      precio: productVariants.precio,
      precioComunidad: productVariants.precioComunidad,
      stock: inventory.stock,
      reservado: inventory.reservado,
    })
    .from(productVariants)
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(eq(productVariants.productId, productId))
    .orderBy(asc(productVariants.sku));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="truncate font-heading text-lg font-semibold tracking-tight">
          {producto.nombre}
        </h1>
        <Link
          href="/vendor/productos"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Volver
        </Link>
      </div>

      {/* Banner de error según query param. */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="font-medium">
            {MENSAJES_ERROR[error] ?? "Ocurrió un error. Intenta de nuevo."}
          </p>
        </div>
      )}

      {/* Edición de los datos base del producto. */}
      <Card>
        <CardHeader>
          <h2 className="font-heading text-sm font-semibold tracking-tight">
            Datos del producto
          </h2>
          <p className="text-xs text-muted-foreground">
            Lo que verán los compradores en tu escaparate.
          </p>
        </CardHeader>
        <CardContent>
          <form
            action={actualizarProducto.bind(null, producto.id)}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="nombre" className="text-sm font-medium">
                Nombre
              </label>
              <Input
                id="nombre"
                name="nombre"
                required
                minLength={3}
                maxLength={120}
                defaultValue={producto.nombre}
                className="h-11"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="descripcion" className="text-sm font-medium">
                Descripción (opcional)
              </label>
              <Textarea
                id="descripcion"
                name="descripcion"
                maxLength={2000}
                rows={4}
                defaultValue={producto.descripcion ?? ""}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tipo" className="text-sm font-medium">
                  Tipo
                </label>
                <Select
                  id="tipo"
                  name="tipo"
                  defaultValue={producto.tipo}
                  className="h-11"
                >
                  <option value="fisico">Físico</option>
                  <option value="preventa">Preventa</option>
                  <option value="drop">Drop</option>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="estado" className="text-sm font-medium">
                  Estado
                </label>
                <Select
                  id="estado"
                  name="estado"
                  // Si estaba agotado/archivado, al guardar pasa a borrador/activo.
                  defaultValue={producto.estado === "activo" ? "activo" : "borrador"}
                  className="h-11"
                >
                  <option value="borrador">Borrador</option>
                  <option value="activo">Activo (visible)</option>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="imagenes" className="text-sm font-medium">
                Imágenes (una URL por línea, máx. 6)
              </label>
              <Textarea
                id="imagenes"
                name="imagenes"
                rows={3}
                defaultValue={(producto.imagenes ?? []).join("\n")}
              />
            </div>

            <Button type="submit" size="lg" className="gap-2">
              <Save className="h-4 w-4" aria-hidden />
              Guardar cambios
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Variantes: precio y stock editables; reservado es solo lectura. */}
      <section className="flex flex-col gap-2">
        <div>
          <h2 className="font-heading text-sm font-semibold tracking-tight">
            Variantes ({variantes.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            Precio y stock por variante; lo reservado lo gestiona el checkout.
          </p>
        </div>
        {variantes.map((v) => {
          const attrs = (v.atributos ?? {}) as { talla?: string; color?: string };
          const etiqueta =
            [attrs.talla, attrs.color].filter(Boolean).join(" · ") ||
            "Sin atributos";
          return (
            <Card key={v.id} className="bg-muted/30">
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-sm font-medium">
                    {v.sku ?? "(sin SKU)"}
                  </span>
                  <span className="text-sm text-muted-foreground">{etiqueta}</span>
                </div>
                <form
                  action={actualizarStock.bind(null, v.id)}
                  className="flex flex-col gap-3"
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor={`precio-${v.id}`}
                        className="text-sm font-medium"
                      >
                        Precio
                      </label>
                      <Input
                        id={`precio-${v.id}`}
                        name="precio"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="99999"
                        required
                        defaultValue={v.precio}
                        className="h-11"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor={`precioComunidad-${v.id}`}
                        className="text-sm font-medium"
                      >
                        Precio comunidad
                      </label>
                      <Input
                        id={`precioComunidad-${v.id}`}
                        name="precioComunidad"
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="99999"
                        defaultValue={v.precioComunidad ?? ""}
                        className="h-11"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label
                        htmlFor={`stock-${v.id}`}
                        className="text-sm font-medium"
                      >
                        Stock
                      </label>
                      <Input
                        id={`stock-${v.id}`}
                        name="stock"
                        type="number"
                        min="0"
                        max="9999"
                        required
                        defaultValue={v.stock ?? 0}
                        className="h-11"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {/* El reservado lo gestionan los holds del checkout: solo lectura. */}
                    <span className="text-sm text-muted-foreground">
                      Reservado: {v.reservado ?? 0}
                    </span>
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden />
                      Guardar
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          );
        })}

        {/* Alta de variante adicional, colapsada por defecto (details/summary nativo). */}
        <details className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 font-heading text-sm font-semibold tracking-tight transition-colors hover:text-primary">
            <Plus className="h-4 w-4" aria-hidden />
            Agregar variante
          </summary>
          <div className="border-t px-4 py-4">
            <form
              action={agregarVariante.bind(null, producto.id)}
              className="flex flex-col gap-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="nueva-talla" className="text-sm font-medium">
                    Talla (opcional)
                  </label>
                  <Input
                    id="nueva-talla"
                    name="talla"
                    maxLength={20}
                    placeholder="L"
                    className="h-11"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="nuevo-color" className="text-sm font-medium">
                    Color (opcional)
                  </label>
                  <Input
                    id="nuevo-color"
                    name="color"
                    maxLength={30}
                    placeholder="Blanco"
                    className="h-11"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="nuevo-precio" className="text-sm font-medium">
                    Precio (MXN)
                  </label>
                  <Input
                    id="nuevo-precio"
                    name="precio"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="99999"
                    required
                    className="h-11"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="nuevo-precioComunidad"
                    className="text-sm font-medium"
                  >
                    Precio comunidad (opcional)
                  </label>
                  <Input
                    id="nuevo-precioComunidad"
                    name="precioComunidad"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="99999"
                    className="h-11"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="nuevo-stock" className="text-sm font-medium">
                    Stock inicial
                  </label>
                  <Input
                    id="nuevo-stock"
                    name="stock"
                    type="number"
                    min="0"
                    max="9999"
                    required
                    defaultValue={0}
                    className="h-11"
                  />
                </div>
              </div>
              <Button type="submit" size="lg" className="gap-2">
                <Plus className="h-4 w-4" aria-hidden />
                Agregar variante
              </Button>
            </form>
          </div>
        </details>
      </section>
    </main>
  );
}
// Fin: detalle y edición de producto del vendedor.
