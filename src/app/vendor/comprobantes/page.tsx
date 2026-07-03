// Panel vendedor — COLA DE VERIFICACIÓN de comprobantes SPEI.
// La tarea central del vendedor aquí es COMPARAR el monto declarado por el
// comprador contra el total del pedido antes de aprobar o rechazar.
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  XCircle,
} from "lucide-react";
import { and, asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { orders } from "@/db/schema/orders";
import { payments } from "@/db/schema/payments";
import { users } from "@/db/schema/users";
import { requireVendorMember } from "@/lib/session";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  accionVerificarPago,
  accionRechazarPago,
} from "@/app/vendor/pedidos/actions";

// Formato monetario MXN consistente en toda la página.
const MXN = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

const FECHA = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});

// Compara montos como CENTAVOS enteros: nunca floats con === directo.
function aCentavos(monto: string): number {
  return Math.round(Number(monto) * 100);
}

// Comparador prominente total vs. monto declarado: ES la tarea de verificación.
function ComparadorMontos({
  total,
  montoDeclarado,
}: {
  total: string;
  montoDeclarado: string | null;
}) {
  const coinciden =
    montoDeclarado !== null && aCentavos(total) === aCentavos(montoDeclarado);

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-2 divide-x">
        <div className="p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Total del pedido
          </p>
          <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums">
            {MXN.format(Number(total))}
          </p>
        </div>
        <div className="p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Monto declarado
          </p>
          {montoDeclarado === null ? (
            <p className="mt-0.5 text-lg font-medium text-muted-foreground">
              Sin declarar
            </p>
          ) : (
            <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums">
              {MXN.format(Number(montoDeclarado))}
            </p>
          )}
        </div>
      </div>
      {montoDeclarado === null ? (
        <div className="flex items-center gap-2 border-t bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <p>Verifica el monto directamente en el comprobante.</p>
        </div>
      ) : coinciden ? (
        <div className="flex items-center gap-2 border-t bg-success/10 px-3 py-2 text-sm font-medium text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          <p>Los montos coinciden</p>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <p>Los montos NO coinciden — revisa antes de verificar</p>
        </div>
      )}
    </div>
  );
}

export default async function VendorComprobantesPage({
  searchParams,
}: {
  // Next.js 15: searchParams es una Promise en Server Components.
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { ok, error } = await searchParams;

  // DECISIÓN MVP: se opera sobre la PRIMERA membresía (multi-tienda después);
  // superadmin sin tienda propia → no hay cola que revisar.
  const { memberships } = await requireVendorMember();
  const vendor = memberships[0];
  if (!vendor) redirect("/");

  // Cola FIFO: pagos SPEI con comprobante enviado, de órdenes de ESTE vendor,
  // con los datos del comprador para contactarlo si algo no cuadra.
  const cola = await db
    .select({
      paymentId: payments.id,
      referencia: payments.referencia,
      montoDeclarado: payments.montoDeclarado,
      enviadoEn: payments.createdAt,
      orderId: orders.id,
      referenciaPago: orders.referenciaPago,
      total: orders.total,
      compradorNombre: users.name,
      compradorEmail: users.email,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .innerJoin(users, eq(orders.compradorId, users.id))
    .where(and(eq(payments.estado, "enviado"), eq(orders.vendorId, vendor.vendorId)))
    .orderBy(asc(payments.createdAt));

  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-heading text-lg font-semibold tracking-tight">
        Comprobantes por verificar ({cola.length})
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

      {cola.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-success/10">
              <CheckCircle2 className="h-6 w-6 text-success" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="font-medium">Todo verificado</p>
              <p className="text-sm text-muted-foreground">
                No hay comprobantes pendientes por revisar.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {cola.map((pago) => (
            <li key={pago.paymentId}>
              <Card>
                <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-2 space-y-0">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-medium">
                      {pago.referenciaPago ?? `#${pago.orderId.slice(0, 8)}`}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {pago.compradorNombre ?? pago.compradorEmail}
                      {pago.compradorNombre && (
                        <span> · {pago.compradorEmail}</span>
                      )}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {FECHA.format(pago.enviadoEn)}
                  </p>
                </CardHeader>

                <CardContent className="flex flex-col gap-3">
                  <ComparadorMontos
                    total={pago.total}
                    montoDeclarado={pago.montoDeclarado}
                  />

                  {pago.referencia && (
                    <p className="text-sm text-muted-foreground">
                      Folio declarado por el comprador:{" "}
                      <span className="font-mono text-foreground">
                        {pago.referencia}
                      </span>
                    </p>
                  )}

                  {/* Comprobante servido por la ruta protegida del vendor.
                      Si es PDF la <img> muestra el alt; el enlace lo abre igual. */}
                  <Card className="w-fit overflow-hidden border shadow-none">
                    <a
                      href={`/api/comprobantes/${pago.orderId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/comprobantes/${pago.orderId}`}
                        alt="Ver comprobante"
                        className="h-40 bg-muted object-contain"
                      />
                      <span className="flex items-center gap-1.5 border-t px-3 py-2 text-sm font-medium text-primary transition-colors group-hover:bg-muted/50">
                        Abrir completo
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    </a>
                  </Card>

                  {/* Veredicto: aprobar o rechazar (dos forms lado a lado). */}
                  <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-end">
                    <form action={accionVerificarPago} className="flex flex-1">
                      <input
                        type="hidden"
                        name="paymentId"
                        value={pago.paymentId}
                      />
                      <Button
                        type="submit"
                        className="flex-1 gap-2 bg-success text-success-foreground hover:bg-success/90"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                        Verificar pago
                      </Button>
                    </form>

                    <form
                      action={accionRechazarPago}
                      className="flex flex-1 flex-col gap-2"
                    >
                      <input
                        type="hidden"
                        name="paymentId"
                        value={pago.paymentId}
                      />
                      <Textarea
                        name="motivo"
                        rows={2}
                        maxLength={500}
                        placeholder="Motivo del rechazo (se le muestra al comprador)"
                        className="min-h-0"
                      />
                      <Button
                        type="submit"
                        variant="destructive"
                        className="flex-1 gap-2"
                      >
                        <XCircle className="h-4 w-4" aria-hidden />
                        Rechazar
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
// Fin: cola de verificación de comprobantes SPEI.
