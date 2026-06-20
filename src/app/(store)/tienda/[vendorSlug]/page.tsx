// Escaparate de un vendedor de la comunidad.
// En Next.js 15 los params de rutas dinámicas son una Promise (hay que await).
export default async function VendorStorePage({
  params,
}: {
  params: Promise<{ vendorSlug: string }>;
}) {
  const { vendorSlug } = await params;
  return (
    <main>
      <h1>Tienda del vendedor: {vendorSlug}</h1>
      {/* TODO: cabecera del vendedor (nombre, aula de entrega por defecto, reputación). */}
      {/* TODO: listado de productos, drops y preventas del vendedor. */}
    </main>
  );
}
