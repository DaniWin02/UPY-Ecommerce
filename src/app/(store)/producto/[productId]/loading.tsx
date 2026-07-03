// Skeleton de la ficha de producto: galería cuadrada + líneas de texto.
// Sin dependencias: solo bloques animate-pulse con los tokens del tema.
export default function ProductLoading() {
  return (
    <main className="pb-40" aria-busy="true" aria-label="Cargando producto">
      {/* Galería falsa (full-bleed cuadrada, como la real) */}
      <div className="aspect-square w-full animate-pulse bg-muted" />

      <section className="space-y-4 p-4">
        {/* Título y vendedor */}
        <div className="space-y-2">
          <div className="h-6 w-3/4 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded-md bg-muted" />
        </div>

        {/* Chips de variantes */}
        <div className="flex gap-2">
          <div className="h-10 w-16 animate-pulse rounded-lg bg-muted" />
          <div className="h-10 w-16 animate-pulse rounded-lg bg-muted" />
          <div className="h-10 w-16 animate-pulse rounded-lg bg-muted" />
        </div>

        {/* Precio y stock */}
        <div className="space-y-2">
          <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded-md bg-muted" />
        </div>

        {/* Bloque de entrega */}
        <div className="h-12 w-full animate-pulse rounded-xl bg-muted" />
      </section>
    </main>
  );
}
