// Ficha de producto.
export default function ProductPage({
  params,
}: {
  params: { productId: string };
}) {
  return (
    <main>
      <h1>Producto: {params.productId}</h1>
      {/* TODO: galería, descripción, selector de variantes y stock disponible. */}
      {/* TODO: acción principal: comprar / unirse a drop / unirse a compra grupal por aula. */}
    </main>
  );
}
