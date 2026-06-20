// Detalle de un pedido con timeline de estados.
export default function OrderDetailPage({
  params,
}: {
  params: { orderId: string };
}) {
  return (
    <main>
      <h1>Pedido: {params.orderId}</h1>
      {/* TODO: resumen del pedido (artículos, vendedor, entrega, comprobante). */}
      {/* TODO: timeline de estados: pendiente_pago -> comprobante_enviado ->
          pago_verificado -> preparando -> listo_entrega -> entregado. */}
    </main>
  );
}
