// Hub del pedido (lado comprador): timeline, instrucciones SPEI, subida de
// comprobante, resumen de artículos y entrega. Se auto-refresca (PollingRefresh)
// mientras el pedido siga vivo, para reflejar verificaciones del vendor.
import { notFound } from "next/navigation";
import { Clock, MapPin, ReceiptText, XCircle } from "lucide-react";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems } from "@/db/schema/orders";
import { payments } from "@/db/schema/payments";
import { vendors } from "@/db/schema/vendors";
import { products, productVariants } from "@/db/schema/products";
import { requireUser } from "@/lib/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { OrderTimeline } from "@/components/OrderTimeline";
import { PaymentInstructions } from "@/components/PaymentInstructions";
import { ComprobanteUploader } from "@/components/ComprobanteUploader";
import { PollingRefresh } from "@/components/PollingRefresh";

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Colores por estado (paleta MASTER, mismos criterios que la lista de pedidos).
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

function formatearMXN(monto: string): string {
  const n = Number(monto);
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    Number.isFinite(n) ? n : 0
  );
}

// Atributos jsonb de la variante ({ talla: "M", color: "Rojo" }) → "M · Rojo".
function describirAtributos(atributos: unknown): string {
  if (!atributos || typeof atributos !== "object") return "";
  return Object.values(atributos as Record<string, unknown>)
    .filter((v): v is string | number => typeof v === "string" || typeof v === "number")
    .map(String)
    .join(" · ");
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  // En Next.js 15 los params de rutas dinámicas son una Promise.
  const { orderId } = await params;
  const user = await requireUser();

  // UUID inválido: 404 directo (y evitamos un error de cast en Postgres).
  if (!RE_UUID.test(orderId)) notFound();

  const [orden] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  // Solo el comprador dueño (o el superadmin en soporte) ve el hub; para el
  // resto el pedido "no existe" — un 404 no filtra información.
  if (!orden || (orden.compradorId !== user.id && user.rolGlobal !== "superadmin")) {
    notFound();
  }

  // Datos satélite en paralelo: tienda, partidas (con producto) y último pago.
  const [[vendor], items, [pago]] = await Promise.all([
    db
      .select({ nombre: vendors.nombre, clabe: vendors.clabe, aulaDefault: vendors.aulaDefault })
      .from(vendors)
      .where(eq(vendors.id, orden.vendorId))
      .limit(1),
    db
      .select({
        id: orderItems.id,
        cantidad: orderItems.cantidad,
        precioUnit: orderItems.precioUnit,
        producto: products.nombre,
        atributos: productVariants.atributos,
      })
      .from(orderItems)
      .innerJoin(productVariants, eq(orderItems.variantId, productVariants.id))
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(eq(orderItems.orderId, orderId)),
    db
      .select({ metodo: payments.metodo, estado: payments.estado })
      .from(payments)
      .where(and(eq(payments.orderId, orderId)))
      .orderBy(desc(payments.createdAt))
      .limit(1),
  ]);

  const metodo: "spei" | "efectivo" = pago?.metodo ?? "spei";
  const referencia = orden.referenciaPago ?? orden.id.slice(0, 8).toUpperCase();
  const aula = orden.aula ?? orden.punto ?? vendor?.aulaDefault ?? null;
  const badge = BADGE_ESTADO[orden.estado] ?? { etiqueta: orden.estado, className: "" };

  // Terminales: ya no cambian solos → sin polling.
  const esTerminal = ["entregado", "expirado", "cancelado"].includes(orden.estado);
  // El comprador debe pagar/subir comprobante en estos dos estados.
  const debePagar = orden.estado === "pendiente_pago" || orden.estado === "rechazado";

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-4">
      <PollingRefresh activo={!esTerminal} />

      {/* Encabezado: referencia grande + estado */}
      <header className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-heading font-mono text-2xl font-semibold tracking-tight">
            {referencia}
          </h1>
          <Badge variant="outline" className={`gap-1.5 ${badge.className}`}>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
            {badge.etiqueta}
          </Badge>
        </div>
        {vendor && <p className="text-sm text-muted-foreground">{vendor.nombre}</p>}
      </header>

      {/* Timeline de la máquina de estados */}
      <Card>
        <CardHeader>
          <h2 className="font-heading text-sm font-semibold tracking-tight">
            Seguimiento
          </h2>
        </CardHeader>
        <CardContent>
          <OrderTimeline estado={orden.estado} metodo={metodo} />
        </CardContent>
      </Card>

      {/* Zona de pago: solo cuando toca pagar (pendiente o rechazado) */}
      {debePagar && (
        <section className="space-y-3">
          {orden.estado === "rechazado" && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {/* payments no guarda motivo de rechazo (V2): mensaje genérico. */}
              <p className="font-medium">Tu comprobante fue rechazado; súbelo de nuevo.</p>
            </div>
          )}

          <PaymentInstructions
            metodo={metodo}
            clabe={vendor?.clabe ?? null}
            referencia={referencia}
            monto={orden.total}
            aula={aula}
          />

          {/* El comprobante solo aplica a SPEI; el efectivo se cobra al recoger. */}
          {metodo === "spei" && <ComprobanteUploader orderId={orden.id} />}

          {orden.expiraEn && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p className="font-medium">
                Tu reserva expira{" "}
                {orden.expiraEn.toLocaleString("es-MX", {
                  day: "numeric",
                  month: "long",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
          )}
        </section>
      )}

      {orden.estado === "comprobante_enviado" && (
        <div className="flex items-start gap-2 rounded-lg border bg-secondary p-3 text-sm text-secondary-foreground">
          <ReceiptText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="font-medium">Tu comprobante está en revisión por la tienda.</p>
        </div>
      )}

      {/* Resumen de artículos + total */}
      <Card>
        <CardHeader>
          <h2 className="font-heading text-sm font-semibold tracking-tight">
            Artículos
          </h2>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este pedido no tiene artículos.</p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => {
                const atributos = describirAtributos(item.atributos);
                const subtotal = Number(item.precioUnit) * item.cantidad;
                return (
                  <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">
                        <span className="tabular-nums text-muted-foreground">
                          {item.cantidad} ×
                        </span>{" "}
                        {item.producto}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {atributos ? `${atributos} · ` : ""}
                        {formatearMXN(item.precioUnit)} c/u
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums">
                      {formatearMXN(String(subtotal))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex items-center justify-between border-t pt-2 text-sm">
            <span className="font-medium">Total</span>
            <span className="font-heading font-bold tabular-nums">
              {formatearMXN(orden.total)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Entrega */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Entrega
              </p>
              <p className="font-medium">
                {aula ?? "Punto de entrega por confirmar con la tienda"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
