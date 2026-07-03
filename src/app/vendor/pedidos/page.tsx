// Panel vendedor — gestión de pedidos con acciones contextuales por estado.
// SPEI se verifica en /vendor/comprobantes; el efectivo se confirma aquí
// (el flujo "cobrar al entregar" = confirmar el pago al recibirlo y luego
// avanzar la orden por la máquina de estados hasta entregado).
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema/orders";
import { payments } from "@/db/schema/payments";
import { users } from "@/db/schema/users";
import { requireVendorMember } from "@/lib/session";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  accionConfirmarEfectivo,
  accionAvanzarEstado,
} from "./actions";

const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const FECHA = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

// Badge por estado de la orden (mapa de colores del repo: warning=pendiente,
// success outline=pagado en curso, success sólido=entregado, destructive=cerrado mal).
function BadgeEstadoOrden({ estado }: { estado: string }) {
  switch (estado) {
    case "pendiente_pago":
      return (
        <Badge className="border-transparent bg-warning text-warning-foreground">
          Pendiente de pago
        </Badge>
      );
    case "comprobante_enviado":
      return <Badge variant="secondary">Comprobante enviado</Badge>;
    case "pago_verificado":
      return (
        <Badge variant="outline" className="border-success text-success">
          Pago verificado
        </Badge>
      );
    case "preparando":
      return (
        <Badge variant="outline" className="border-success text-success">
          Preparando
        </Badge>
      );
    case "listo_entrega":
      return (
        <Badge variant="outline" className="border-success text-success">
          Listo para entrega
        </Badge>
      );
    case "entregado":
      return (
        <Badge className="border-transparent bg-success text-success-foreground">
          Entregado
        </Badge>
      );
    case "rechazado":
      return <Badge variant="destructive">Rechazado</Badge>;
    case "expirado":
      return <Badge variant="destructive">Expirado</Badge>;
    case "cancelado":
      return <Badge variant="destructive">Cancelado</Badge>;
    default:
      return <Badge variant="outline">{estado}</Badge>;
  }
}

// Botón de avance de estado: form con orderId + nuevo estado ocultos.
function FormAvanzar({
  orderId,
  nuevo,
  etiqueta,
}: {
  orderId: string;
  nuevo: "preparando" | "listo_entrega" | "entregado";
  etiqueta: string;
}) {
  return (
    <form action={accionAvanzarEstado}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="nuevo" value={nuevo} />
      <Button type="submit" size="sm">
        {etiqueta}
      </Button>
    </form>
  );
}

export default async function VendorPedidosPage({
  searchParams,
}: {
  // Next.js 15: searchParams es una Promise en Server Components.
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;

  // DECISIÓN MVP: primera membresía (multi-tienda después);
  // superadmin sin tienda propia → no hay pedidos que gestionar.
  const { memberships } = await requireVendorMember();
  const vendor = memberships[0];
  if (!vendor) redirect("/");

  // Pedidos del vendor (recientes primero) con los datos del comprador.
  const pedidos = await db
    .select({
      id: orders.id,
      estado: orders.estado,
      total: orders.total,
      referenciaPago: orders.referenciaPago,
      metodoEntrega: orders.metodoEntrega,
      aula: orders.aula,
      punto: orders.punto,
      createdAt: orders.createdAt,
      compradorNombre: users.name,
      compradorEmail: users.email,
    })
    .from(orders)
    .innerJoin(users, eq(orders.compradorId, users.id))
    .where(eq(orders.vendorId, vendor.vendorId))
    .orderBy(desc(orders.createdAt));

  // Pagos de esas órdenes en query aparte: puede haber 1..N por orden
  // (reintentos tras rechazo) y un JOIN duplicaría filas de pedidos.
  const pagos =
    pedidos.length > 0
      ? await db
          .select({
            orderId: payments.orderId,
            metodo: payments.metodo,
            estado: payments.estado,
          })
          .from(payments)
          .where(
            inArray(
              payments.orderId,
              pedidos.map((p) => p.id)
            )
          )
          .orderBy(desc(payments.createdAt))
      : [];

  // Nos quedamos con el pago MÁS RECIENTE de cada orden (el vigente).
  const pagoPorOrden = new Map<string, (typeof pagos)[number]>();
  for (const pago of pagos) {
    if (!pagoPorOrden.has(pago.orderId)) pagoPorOrden.set(pago.orderId, pago);
  }

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Pedidos ({pedidos.length})</h1>

      {/* Banners de resultado de la última acción (vienen del redirect). */}
      {ok && (
        <div
          role="status"
          className="rounded-md border border-success/50 bg-success/10 px-4 py-3 text-sm text-success"
        >
          Acción realizada correctamente.
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          No se pudo completar la acción: {error}
        </div>
      )}

      {pedidos.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Aún no tienes pedidos
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {pedidos.map((pedido) => {
            const pago = pagoPorOrden.get(pedido.id);
            return (
              <li key={pedido.id}>
                <Card>
                  <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">
                        {pedido.referenciaPago ?? `#${pedido.id.slice(0, 8)}`}
                      </span>
                      <BadgeEstadoOrden estado={pedido.estado} />
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground">
                      {FECHA.format(pedido.createdAt)}
                    </p>
                  </CardHeader>

                  <CardContent className="flex flex-col gap-3">
                    <div className="text-sm text-muted-foreground">
                      <p className="truncate">
                        {pedido.compradorNombre ?? pedido.compradorEmail}
                        {pedido.compradorNombre && (
                          <span> · {pedido.compradorEmail}</span>
                        )}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-semibold text-foreground">
                          {MXN.format(Number(pedido.total))}
                        </span>
                        <span>
                          {pago
                            ? pago.metodo === "spei"
                              ? "🏦 SPEI"
                              : "💵 Efectivo"
                            : "Sin pago registrado"}
                        </span>
                        <span>
                          {pedido.metodoEntrega === "aula"
                            ? `Aula: ${pedido.aula ?? "—"}`
                            : `Punto: ${pedido.punto ?? "—"}`}
                        </span>
                      </p>
                    </div>

                    {/* Acciones contextuales según el estado de la orden. */}
                    {pedido.estado === "pendiente_pago" &&
                      pago?.metodo === "efectivo" && (
                        <div className="flex flex-col gap-1">
                          <form action={accionConfirmarEfectivo}>
                            <input
                              type="hidden"
                              name="orderId"
                              value={pedido.id}
                            />
                            <Button
                              type="submit"
                              size="sm"
                              className="bg-success text-success-foreground hover:bg-success/90"
                            >
                              💵 Confirmar pago recibido
                            </Button>
                          </form>
                          <p className="text-xs text-muted-foreground">
                            Confirma el pago y descuenta el stock. Si cobras al
                            entregar: púlsalo al recibir el efectivo y avanza
                            los estados.
                          </p>
                        </div>
                      )}

                    {pedido.estado === "comprobante_enviado" && (
                      <Link
                        href="/vendor/comprobantes"
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Ver en comprobantes →
                      </Link>
                    )}

                    {pedido.estado === "pago_verificado" && (
                      <FormAvanzar
                        orderId={pedido.id}
                        nuevo="preparando"
                        etiqueta="Empezar a preparar"
                      />
                    )}

                    {pedido.estado === "preparando" && (
                      <FormAvanzar
                        orderId={pedido.id}
                        nuevo="listo_entrega"
                        etiqueta="Marcar listo para entrega"
                      />
                    )}

                    {pedido.estado === "listo_entrega" && (
                      <FormAvanzar
                        orderId={pedido.id}
                        nuevo="entregado"
                        etiqueta="Marcar entregado ✓"
                      />
                    )}
                    {/* Estados terminales (entregado/rechazado/expirado/cancelado): sin acciones. */}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
// Fin: gestión de pedidos del vendedor.
