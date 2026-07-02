// Shell de aplicación (RSC): resuelve la sesión en el servidor y monta el
// cromo de navegación + contenedor de contenido con ancho máximo.
import { getSessionUser } from "@/lib/session";
import { Chrome } from "./Chrome";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <>
      <Chrome
        user={user ? { name: user.name, rolGlobal: user.rolGlobal } : null}
      />
      <div className="mx-auto w-full max-w-6xl md:px-4">{children}</div>
      {/* Espaciador para que el contenido no quede oculto tras el tab bar móvil.
          En /auth y /bloqueado el Chrome no se renderiza pero el spacer es inocuo. */}
      <div className="h-16 md:hidden" aria-hidden="true" />
    </>
  );
}
