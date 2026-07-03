// /bloqueado — página estática (RSC) mostrada cuando la IP del visitante
// no pertenece a la red del campus. Sin lógica: el middleware decide.
import { ShieldAlert } from "lucide-react";

export const metadata = {
  title: "Acceso restringido | Ágora Campus",
};

export default function BloqueadoPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 px-6 text-foreground">
      <div className="w-full max-w-md text-center">
        {/* Icono de escudo en círculo destructivo suave */}
        <div
          aria-hidden="true"
          className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-destructive/10 text-destructive"
        >
          <ShieldAlert className="h-8 w-8" />
        </div>

        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          Acceso restringido
        </h1>

        <p className="mt-4 leading-relaxed text-muted-foreground">
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
