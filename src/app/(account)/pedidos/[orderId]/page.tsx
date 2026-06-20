// Detalle de un pedido con timeline de estados.
// En Next.js 15 los params de rutas dinámicas son una Promise (hay que await).
export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return (
    <main>
      <h1>Pedido: {orderId}</h1>
      {/* TODO: resumen del pedido (artículos, vendedor, entrega, comprobante). */}
      {/* TODO: timeline de estados: pendiente_pago -> comprobante_enviado ->
          pago_verificado -> preparando -> listo_entrega -> entregado. */}
    </main>
  );
}
