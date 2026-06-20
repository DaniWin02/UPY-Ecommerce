// Ficha de producto.
// En Next.js 15 los params de rutas dinámicas son una Promise (hay que await).
export default async function ProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return (
    <main>
      <h1>Producto: {productId}</h1>
      {/* TODO: galería, descripción, selector de variantes y stock disponible. */}
      {/* TODO: acción principal: comprar / unirse a drop / unirse a compra grupal por aula. */}
    </main>
  );
}
