// Mis pedidos: lista del comprador con estado, tienda, total y fecha.
// RSC puro: lee la BD directo y enlaza al hub de cada pedido.
import Link from "next/link";
import { ChevronRight, PackageOpen } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema/orders";
import { vendors } from "@/db/schema/vendors";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

// Colores por estado del pedido (paleta MASTER: warning/secondary/success/destructive).
const BADGE_ESTADO: Record<string, { etiqueta: string; className: string }> = {
  pendiente_pago: {
    etiqueta: "Pendiente de pago",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  comprobante_enviado: {
    etiqueta: "En revisión",
    className: "border-transparent bg-secondary text-secondary-foreground",
  },
  pago_verificado: {
    etiqueta: "Pago verificado",
    className: "border-success/40 bg-success/10 text-success",
  },
  preparando: {
    etiqueta: "Preparando",
    className: "border-success/40 bg-success/10 text-success",
  },
  listo_entrega: {
    etiqueta: "Listo para entrega",
    className: "border-success/40 bg-success/10 text-success",
  },
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

// Badge de estado con punto de color (patrón MASTER).
function BadgeConPunto({ estado }: { estado: string }) {
  const badge = BADGE_ESTADO[estado] ?? { etiqueta: estado, className: "" };
  return (
    <Badge variant="outline" className={`gap-1.5 ${badge.className}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {badge.etiqueta}
    </Badge>
  );
}

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
      <h1 className="font-heading text-xl font-semibold tracking-tight md:text-2xl">
        Mis pedidos
      </h1>

      {pedidos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-muted">
              <PackageOpen className="h-6 w-6 text-muted-foreground" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="font-medium">Aún no tienes pedidos</p>
              <p className="text-sm text-muted-foreground">
                Cuando compres algo en el campus, aparecerá aquí.
              </p>
            </div>
            {/* El Button del proyecto aún no soporta asChild: Link con estilo de botón. */}
            <Link
              href="/"
              className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:opacity-80"
            >
              Explorar tiendas del campus
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {pedidos.map((pedido) => (
            <li key={pedido.id}>
              <Link
                href={`/pedidos/${pedido.id}`}
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="cursor-pointer transition-all duration-200 hover:border-primary/40 hover:shadow-md">
                  <CardContent className="flex items-center justify-between gap-3 pt-4">
                    <div className="min-w-0 space-y-0.5">
                      <p className="font-mono text-sm font-medium">
                        {pedido.referenciaPago ?? pedido.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {pedido.tienda}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fechaRelativa(pedido.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-heading font-semibold tabular-nums">
                          {formatearMXN(pedido.total)}
                        </span>
                        <BadgeConPunto estado={pedido.estado} />
                      </div>
                      <ChevronRight
                        className="h-4 w-4 text-muted-foreground"
                        aria-hidden
                      />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
