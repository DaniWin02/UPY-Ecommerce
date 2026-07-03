// Panel vendedor — alta de producto con su primera variante e inventario.
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Save } from "lucide-react";
import { crearProducto } from "../actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export default async function NuevoProductoPage({
  searchParams,
}: {
  // Next.js 15: searchParams es una Promise en Server Components.
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-heading text-lg font-semibold tracking-tight">
          Nuevo producto
        </h1>
        <Link
          href="/vendor/productos"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Volver
        </Link>
      </div>

      {/* Banner de error genérico (el detalle por campo llega en V1). */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="font-medium">
            Revisa los datos del formulario: hay campos inválidos o incompletos.
          </p>
        </div>
      )}

      <form action={crearProducto} className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-heading text-sm font-semibold tracking-tight">
              Datos del producto
            </h2>
            <p className="text-xs text-muted-foreground">
              Lo que verán los compradores en tu escaparate.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
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
                placeholder="Sudadera Ágora edición campus"
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
                placeholder="Materiales, tallas, tiempos de entrega en campus…"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tipo" className="text-sm font-medium">
                  Tipo
                </label>
                <Select id="tipo" name="tipo" defaultValue="fisico" className="h-11">
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
                  defaultValue="borrador"
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
                placeholder={"https://…/foto-frente.jpg\nhttps://…/foto-espalda.jpg"}
              />
            </div>
          </CardContent>
        </Card>

        {/* La primera variante se crea junto con el producto (siempre hay 1 SKU). */}
        <Card className="bg-muted/30">
          <CardHeader>
            <h2 className="font-heading text-sm font-semibold tracking-tight">
              Primera variante
            </h2>
            <p className="text-xs text-muted-foreground">
              Todo producto necesita al menos una variante con precio y stock.
            </p>
          </CardHeader>
          <CardContent>
            <fieldset className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="talla" className="text-sm font-medium">
                    Talla (opcional)
                  </label>
                  <Input
                    id="talla"
                    name="talla"
                    maxLength={20}
                    placeholder="M"
                    className="h-11"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="color" className="text-sm font-medium">
                    Color (opcional)
                  </label>
                  <Input
                    id="color"
                    name="color"
                    maxLength={30}
                    placeholder="Negro"
                    className="h-11"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="precio" className="text-sm font-medium">
                    Precio (MXN)
                  </label>
                  <Input
                    id="precio"
                    name="precio"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="99999"
                    required
                    placeholder="350.00"
                    className="h-11"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="precioComunidad" className="text-sm font-medium">
                    Precio comunidad (opcional)
                  </label>
                  <Input
                    id="precioComunidad"
                    name="precioComunidad"
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="99999"
                    placeholder="300.00"
                    className="h-11"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="stock" className="text-sm font-medium">
                    Stock inicial
                  </label>
                  <Input
                    id="stock"
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
            </fieldset>
          </CardContent>
        </Card>

        <Button type="submit" size="lg" className="gap-2">
          <Save className="h-4 w-4" aria-hidden />
          Crear producto
        </Button>
      </form>
    </main>
  );
}
// Fin: alta de producto del vendedor.
