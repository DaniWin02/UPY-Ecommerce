// Escaparate de un vendedor de la comunidad.
export default function VendorStorePage({
  params,
}: {
  params: { vendorSlug: string };
}) {
  return (
    <main>
      <h1>Tienda del vendedor: {params.vendorSlug}</h1>
      {/* TODO: cabecera del vendedor (nombre, aula de entrega por defecto, reputación). */}
      {/* TODO: listado de productos, drops y preventas del vendedor. */}
    </main>
  );
}
