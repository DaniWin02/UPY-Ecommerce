// Mis pedidos: lista del comprador con estado, tienda, total y fecha.
// RSC puro: lee la BD directo y enlaza al hub de cada pedido.
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema/orders";
import { vendors } from "@/db/schema/vendors";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

// Colores por estado del pedido (tokens success/warning del tema).
const BADGE_ESTADO: Record<string, { etiqueta: string; className: string }> = {
  pendiente_pago: {
    etiqueta: "Pendiente de pago",
    className: "border-transparent bg-warning text-warning-foreground",
  },
  comprobante_enviado: {
    etiqueta: "Comprobante en revisión",
    className: "border-transparent bg-secondary text-secondary-foreground",
  },
  pago_verificado: { etiqueta: "Pago verificado", className: "border-success text-success" },
  preparando: { etiqueta: "Preparando", className: "border-success text-success" },
  listo_entrega: { etiqueta: "Listo para entrega", className: "border-success text-success" },
  entregado: {
    etiqueta: "Entregado",
    className: "border-transparent bg-success text-success-foreground",
  },
  rechazado: {
    etiqueta: "Comprobante rechazado",
    className: "border-transparent bg-destructive text-destructive-foreground",
  },
  expirado: {
    etiqueta: "Expirado",
    className: "border-transparent bg-destructive text-destructive-foreground",
  },
  cancelado: {
    etiqueta: "Cancelado",
    className: "border-transparent bg-destructive text-destructive-foreground",
  },
};

// Fecha relativa simple ("hace 5 min", "hace 3 h", "hace 2 días" o fecha corta).
function fechaRelativa(fecha: Date): string {
  const ms = Date.now() - fecha.getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return dias === 1 ? "ayer" : `hace ${dias} días`;
  return fecha.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

function formatearMXN(monto: string): string {
  const n = Number(monto);
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    Number.isFinite(n) ? n : 0
  );
}

export default async function OrdersPage() {
  const user = await requireUser();

  // Pedidos del comprador, más recientes primero, con el nombre de la tienda.
  const pedidos = await db
    .select({
      id: orders.id,
      referenciaPago: orders.referenciaPago,
      estado: orders.estado,
      total: orders.total,
      createdAt: orders.createdAt,
      tienda: vendors.nombre,
    })
    .from(orders)
    .innerJoin(vendors, eq(orders.vendorId, vendors.id))
    .where(eq(orders.compradorId, user.id))
    .orderBy(desc(orders.createdAt));

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Mis pedidos</h1>

      {pedidos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">Aún no tienes pedidos.</p>
            {/* El Button del proyecto aún no soporta asChild: Link con estilo de botón. */}
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Explorar tiendas del campus
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {pedidos.map((pedido) => {
            const badge = BADGE_ESTADO[pedido.estado] ?? {
              etiqueta: pedido.estado,
              className: "",
            };
            return (
              <li key={pedido.id}>
                <Link href={`/pedidos/${pedido.id}`} className="block">
                  <Card className="transition-colors hover:bg-accent/50">
                    <CardContent className="space-y-1.5 pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold">
                          {pedido.referenciaPago ?? pedido.id.slice(0, 8).toUpperCase()}
                        </span>
                        <Badge variant="outline" className={badge.className}>
                          {badge.etiqueta}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{pedido.tienda}</p>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold tabular-nums">
                          {formatearMXN(pedido.total)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {fechaRelativa(pedido.createdAt)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
