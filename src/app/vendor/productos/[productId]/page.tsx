// Panel vendedor — detalle de producto: edición, variantes y stock.
import Link from "next/link";
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
        <h1 className="truncate text-lg font-semibold">{producto.nombre}</h1>
        <Link
          href="/vendor/productos"
          className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
        >
          ← Volver
        </Link>
      </div>

      {/* Banner de error según query param. */}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {MENSAJES_ERROR[error] ?? "Ocurrió un error. Intenta de nuevo."}
        </div>
      )}

      {/* Edición de los datos base del producto. */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold">Datos del producto</h2>
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

            <Button type="submit" size="lg">
              Guardar cambios
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Variantes: precio y stock editables; reservado es solo lectura. */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">
          Variantes ({variantes.length})
        </h2>
        {variantes.map((v) => {
          const attrs = (v.atributos ?? {}) as { talla?: string; color?: string };
          const etiqueta =
            [attrs.talla, attrs.color].filter(Boolean).join(" · ") ||
            "Sin atributos";
          return (
            <Card key={v.id}>
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
                    <Button type="submit" variant="outline" size="sm">
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
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold">
            + Agregar variante
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
              <Button type="submit" size="lg">
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
