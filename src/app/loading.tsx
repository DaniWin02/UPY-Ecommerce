// Skeleton del catálogo mientras el RSC de la home resuelve sus consultas.
// Sin dependencias: solo bloques animate-pulse con los tokens del tema.
export default function HomeLoading() {
  return (
    <main className="pb-20">
      <div className="container space-y-4 pt-4" aria-busy="true" aria-label="Cargando catálogo">
        {/* Header falso: buscador + fila de chips */}
        <div className="flex gap-2">
          <div className="h-11 flex-1 animate-pulse rounded-md bg-muted" />
          <div className="h-11 w-11 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-20 animate-pulse rounded-full bg-muted" />
          <div className="h-9 w-20 animate-pulse rounded-full bg-muted" />
          <div className="h-9 w-24 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="h-6 w-44 animate-pulse rounded-md bg-muted" />

        {/* Grid de 6 tarjetas fantasma */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-square w-full animate-pulse rounded-xl bg-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
