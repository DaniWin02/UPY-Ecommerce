// Hub del pedido (lado comprador): timeline, instrucciones SPEI, subida de
// comprobante, resumen de artículos y entrega. Se auto-refresca (PollingRefresh)
// mientras el pedido siga vivo, para reflejar verificaciones del vendor.
import { notFound } from "next/navigation";
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

// Colores por estado (mismos criterios que la lista de pedidos).
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
          <h1 className="font-mono text-2xl font-bold tracking-wide">{referencia}</h1>
          <Badge variant="outline" className={badge.className}>
            {badge.etiqueta}
          </Badge>
        </div>
        {vendor && <p className="text-sm text-muted-foreground">{vendor.nombre}</p>}
      </header>

      {/* Timeline de la máquina de estados */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold">Seguimiento</h2>
        </CardHeader>
        <CardContent>
          <OrderTimeline estado={orden.estado} metodo={metodo} />
        </CardContent>
      </Card>

      {/* Zona de pago: solo cuando toca pagar (pendiente o rechazado) */}
      {debePagar && (
        <section className="space-y-3">
          {orden.estado === "rechazado" && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
              {/* payments no guarda motivo de rechazo (V2): mensaje genérico. */}
              Tu comprobante fue rechazado; súbelo de nuevo.
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
            <p className="text-sm font-medium text-warning">
              ⏳ Tu reserva expira{" "}
              {orden.expiraEn.toLocaleString("es-MX", {
                day: "numeric",
                month: "long",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
        </section>
      )}

      {orden.estado === "comprobante_enviado" && (
        <div className="rounded-md border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground">
          Tu comprobante está en revisión por la tienda.
        </div>
      )}

      {/* Resumen de artículos + total */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold">Artículos</h2>
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
                      <p className="font-medium">{item.producto}</p>
                      <p className="text-xs text-muted-foreground">
                        {atributos ? `${atributos} · ` : ""}
                        {item.cantidad} × {formatearMXN(item.precioUnit)}
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
          <div className="flex items-center justify-between border-t pt-2 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatearMXN(orden.total)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Entrega */}
      <Card>
        <CardContent className="pt-4">
          <p className="text-sm">
            📍{" "}
            <span className="font-medium">
              {aula ?? "Punto de entrega por confirmar con la tienda"}
            </span>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
