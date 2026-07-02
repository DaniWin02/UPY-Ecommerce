// Panel vendedor — lista de productos con variantes y stock disponible.
// DECISIÓN MVP: se muestra el catálogo de la PRIMERA membresía del usuario
// (multi-tienda llega después); superadmin sin tienda → redirect("/").
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, productVariants, inventory } from "@/db/schema/products";
import { requireVendorMember } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Badge por estado del producto (activo=verde outline, borrador=secondary, agotado=ámbar).
function BadgeEstado({ estado }: { estado: string }) {
  if (estado === "activo") {
    return (
      <Badge variant="outline" className="border-emerald-500 text-emerald-600">
        Activo
      </Badge>
    );
  }
  if (estado === "borrador") return <Badge variant="secondary">Borrador</Badge>;
  if (estado === "agotado") {
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-600">
        Agotado
      </Badge>
    );
  }
  return <Badge variant="outline">Archivado</Badge>;
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
        <h1 className="text-lg font-semibold">Productos</h1>
        <Link href="/vendor/productos/nuevo">
          <Button>+ Nuevo producto</Button>
        </Link>
      </div>

      {filas.length === 0 ? (
        // Empty state con CTA para el primer producto.
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Aún no tienes productos. Crea el primero para que aparezca en tu
              escaparate.
            </p>
            <Link href="/vendor/productos/nuevo">
              <Button size="lg">Crear mi primer producto</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        // Tabla-card móvil-first: una Card por producto.
        <ul className="flex flex-col gap-2">
          {filas.map((p) => (
            <li key={p.id}>
              <Card>
                <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{p.nombre}</span>
                      <BadgeEstado estado={p.estado} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {TIPO_LABEL[p.tipo] ?? p.tipo} · {p.variantes}{" "}
                      {p.variantes === 1 ? "variante" : "variantes"} ·{" "}
                      {p.disponible} en stock
                    </p>
                  </div>
                  <Link
                    href={`/vendor/productos/${p.id}`}
                    className="shrink-0 self-start sm:self-center"
                  >
                    <Button variant="outline" size="sm">
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
