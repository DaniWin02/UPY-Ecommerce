// Panel vendedor — lista de productos con variantes y stock disponible.
// DECISIÓN MVP: se muestra el catálogo de la PRIMERA membresía del usuario
// (multi-tienda llega después); superadmin sin tienda → redirect("/").
import Link from "next/link";
import { Image as ImageIcon, Pencil, Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, productVariants, inventory } from "@/db/schema/products";
import { requireVendorMember } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Badge por estado del producto (punto de color, tokens success/warning del tema).
function BadgeEstado({ estado }: { estado: string }) {
  if (estado === "activo") {
    return (
      <Badge variant="outline" className="gap-1.5 border-success/40 bg-success/10 text-success">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
        Activo
      </Badge>
    );
  }
  if (estado === "borrador") {
    return (
      <Badge variant="secondary" className="gap-1.5">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
        Borrador
      </Badge>
    );
  }
  if (estado === "agotado") {
    return (
      <Badge variant="outline" className="gap-1.5 border-warning/40 bg-warning/10 text-warning">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
        Agotado
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5 text-muted-foreground">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      Archivado
    </Badge>
  );
}

// Etiqueta legible del tipo de producto.
const TIPO_LABEL: Record<string, string> = {
  fisico: "Físico",
  preventa: "Preventa",
  drop: "Drop",
};

export default async function VendorProductosPage() {
  const { memberships } = await requireVendorMember();
  const vendor = memberships[0];
  // Superadmin sin tienda propia: no hay catálogo que administrar.
  if (!vendor) redirect("/");

  // Productos del vendor + conteo de variantes + stock disponible (stock - reservado).
  const filas = await db
    .select({
      id: products.id,
      nombre: products.nombre,
      estado: products.estado,
      tipo: products.tipo,
      variantes: sql<number>`count(${productVariants.id})`.mapWith(Number),
      disponible:
        sql<number>`coalesce(sum(${inventory.stock} - ${inventory.reservado}), 0)`.mapWith(
          Number
        ),
    })
    .from(products)
    .leftJoin(productVariants, eq(productVariants.productId, products.id))
    .leftJoin(inventory, eq(inventory.variantId, productVariants.id))
    .where(eq(products.vendorId, vendor.vendorId))
    .groupBy(products.id)
    .orderBy(desc(products.createdAt));

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-heading text-lg font-semibold tracking-tight">
          Productos
        </h1>
        <Link href="/vendor/productos/nuevo">
          <Button className="gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            Nuevo producto
          </Button>
        </Link>
      </div>

      {filas.length === 0 ? (
        // Empty state con CTA para el primer producto.
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-muted">
              <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="font-medium">Aún no tienes productos</p>
              <p className="text-sm text-muted-foreground">
                Crea el primero para que aparezca en tu escaparate.
              </p>
            </div>
            <Link href="/vendor/productos/nuevo">
              <Button size="lg" className="gap-2">
                <Plus className="h-4 w-4" aria-hidden />
                Crear mi primer producto
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        // Tabla-card móvil-first: una Card por producto.
        <ul className="flex flex-col gap-2">
          {filas.map((p) => (
            <li key={p.id}>
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  {/* Thumbnail placeholder (las imágenes reales llegan en V1). */}
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-muted">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{p.nombre}</span>
                      <BadgeEstado estado={p.estado} />
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {TIPO_LABEL[p.tipo] ?? p.tipo} · {p.variantes}{" "}
                      {p.variantes === 1 ? "variante" : "variantes"} ·{" "}
                      {p.disponible} en stock
                    </p>
                  </div>
                  <Link href={`/vendor/productos/${p.id}`} className="shrink-0">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Editar
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
// Fin: gestión de productos del vendedor.
