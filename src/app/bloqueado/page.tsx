// /bloqueado — página estática (RSC) mostrada cuando la IP del visitante
// no pertenece a la red del campus. Sin lógica: el middleware decide.

export const metadata = {
  title: "Acceso restringido | Ágora Campus",
};

export default function BloqueadoPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md text-center">
        {/* Icono de candado (emoji, sin dependencias) */}
        <div aria-hidden="true" className="mb-6 text-6xl">
          🔒
        </div>

        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Acceso restringido
        </h1>

        <p className="mt-4 text-muted-foreground">
          Ágora Campus solo está disponible desde la red de la universidad.
          Conéctate al WiFi del campus e inténtalo de nuevo.
        </p>

        <p className="mt-8 text-sm text-muted-foreground">
          ¿Crees que esto es un error? Escríbenos a soporte de Ágora Campus.
        </p>
      </div>
    </main>
  );
}

// Fin de /bloqueado/page.tsx
