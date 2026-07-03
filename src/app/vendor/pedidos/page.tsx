// Panel vendedor — gestión de pedidos con acciones contextuales por estado.
// SPEI se verifica en /vendor/comprobantes; el efectivo se confirma aquí
// (el flujo "cobrar al entregar" = confirmar el pago al recibirlo y luego
// avanzar la orden por la máquina de estados hasta entregado).
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  ChefHat,
  Landmark,
  PackageCheck,
  PackageOpen,
  type LucideIcon,
} from "lucide-react";
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

// Colores por estado de la orden (paleta MASTER: warning=pendiente,
// success suave=pagado en curso, success sólido=entregado, destructive=cerrado mal).
const BADGE_ESTADO: Record<string, { etiqueta: string; className: string }> = {
  pendiente_pago: {
    etiqueta: "Pendiente de pago",
    className: "border-warning/40 bg-warning/10 text-warning",
  },
  comprobante_enviado: {
    etiqueta: "Comprobante enviado",
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
    etiqueta: "Rechazado",
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
function BadgeEstadoOrden({ estado }: { estado: string }) {
  const badge = BADGE_ESTADO[estado] ?? { etiqueta: estado, className: "" };
  return (
    <Badge variant="outline" className={`gap-1.5 ${badge.className}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {badge.etiqueta}
    </Badge>
  );
}

// Botón de avance de estado: form con orderId + nuevo estado ocultos.
function FormAvanzar({
  orderId,
  nuevo,
  etiqueta,
  icono: Icono,
}: {
  orderId: string;
  nuevo: "preparando" | "listo_entrega" | "entregado";
  etiqueta: string;
  icono: LucideIcon;
}) {
  return (
    <form action={accionAvanzarEstado}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="nuevo" value={nuevo} />
      <Button type="submit" size="sm" className="gap-2">
        <Icono className="h-4 w-4" aria-hidden />
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
      <h1 className="font-heading text-lg font-semibold tracking-tight">
        Pedidos ({pedidos.length})
      </h1>

      {/* Banners de resultado de la última acción (vienen del redirect). */}
      {ok && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="font-medium">Acción realizada correctamente.</p>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="font-medium">No se pudo completar la acción: {error}</p>
        </div>
      )}

      {pedidos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-muted">
              <PackageOpen className="h-6 w-6 text-muted-foreground" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="font-medium">Aún no tienes pedidos</p>
              <p className="text-sm text-muted-foreground">
                Cuando alguien compre en tu tienda, aparecerá aquí.
              </p>
            </div>
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
                      <span className="font-mono text-sm font-medium">
                        {pedido.referenciaPago ?? `#${pedido.id.slice(0, 8)}`}
                      </span>
                      <BadgeEstadoOrden estado={pedido.estado} />
                    </div>
                    <p className="shrink-0 text-xs text-muted-foreground">
                      {FECHA.format(pedido.createdAt)}
                    </p>
                  </CardHeader>

                  <CardContent className="flex flex-col gap-3">
                    <div className="text-sm">
                      <p className="truncate text-xs text-muted-foreground">
                        {pedido.compradorNombre ?? pedido.compradorEmail}
                        {pedido.compradorNombre && (
                          <span> · {pedido.compradorEmail}</span>
                        )}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-heading font-semibold tabular-nums">
                          {MXN.format(Number(pedido.total))}
                        </span>
                        {pago ? (
                          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {pago.metodo === "spei" ? (
                              <>
                                <Landmark className="h-3 w-3" aria-hidden />
                                SPEI
                              </>
                            ) : (
                              <>
                                <Banknote className="h-3 w-3" aria-hidden />
                                Efectivo
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Sin pago registrado
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {pedido.metodoEntrega === "aula"
                            ? `Aula: ${pedido.aula ?? "—"}`
                            : `Punto: ${pedido.punto ?? "—"}`}
                        </span>
                      </p>
                    </div>

                    {/* Acciones contextuales según el estado de la orden. */}
                    {pedido.estado === "pendiente_pago" &&
                      pago?.metodo === "efectivo" && (
                        <div className="flex flex-col gap-1.5 border-t pt-3">
                          <form action={accionConfirmarEfectivo}>
                            <input
                              type="hidden"
                              name="orderId"
                              value={pedido.id}
                            />
                            <Button
                              type="submit"
                              size="sm"
                              className="gap-2 bg-success text-success-foreground hover:bg-success/90"
                            >
                              <Banknote className="h-4 w-4" aria-hidden />
                              Confirmar pago recibido
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
                      <div className="border-t pt-3">
                        <Link
                          href="/vendor/comprobantes"
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:underline"
                        >
                          Ver en comprobantes
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </Link>
                      </div>
                    )}

                    {pedido.estado === "pago_verificado" && (
                      <div className="border-t pt-3">
                        <FormAvanzar
                          orderId={pedido.id}
                          nuevo="preparando"
                          etiqueta="Empezar a preparar"
                          icono={ChefHat}
                        />
                      </div>
                    )}

                    {pedido.estado === "preparando" && (
                      <div className="border-t pt-3">
                        <FormAvanzar
                          orderId={pedido.id}
                          nuevo="listo_entrega"
                          etiqueta="Marcar listo para entrega"
                          icono={PackageCheck}
                        />
                      </div>
                    )}

                    {pedido.estado === "listo_entrega" && (
                      <div className="border-t pt-3">
                        <FormAvanzar
                          orderId={pedido.id}
                          nuevo="entregado"
                          etiqueta="Marcar entregado"
                          icono={CheckCircle2}
                        />
                      </div>
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
