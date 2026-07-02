"use client";

// Cromo de navegación de Ágora Campus: header sticky + tab bar inferior móvil.
// Client component: necesita usePathname() para resaltar la pestaña activa
// y ocultarse por completo en las rutas de autenticación/bloqueo.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Flame, Package, CircleUser, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChromeProps {
  user: { name: string | null; rolGlobal: string } | null;
  cartCount: number;
}

// Pestañas del tab bar móvil (y enlaces de texto del header en ≥md).
const tabs = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/drops", label: "Drops", icon: Flame },
  { href: "/pedidos", label: "Pedidos", icon: Package },
  { href: "/perfil", label: "Perfil", icon: CircleUser },
] as const;

// Activo: igualdad exacta para "/", prefijo con "/" para el resto
// (evita que "/" quede activo en todas las rutas).
function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Chrome({ user, cartCount }: ChromeProps) {
  const pathname = usePathname();

  // En auth y bloqueado no se muestra ningún cromo (pantallas a página completa).
  if (pathname.startsWith("/auth") || pathname.startsWith("/bloqueado")) {
    return null;
  }

  return (
    <>
      {/* Header superior sticky */}
      <header className="sticky top-0 z-40 h-14 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between px-4">
          <Link
            href="/"
            className="touch-target flex items-center gap-2 font-semibold"
            aria-label="Ágora, ir al inicio"
          >
            <span aria-hidden="true" className="text-xl">
              🏛️
            </span>
            <span className="text-lg tracking-tight">Ágora</span>
          </Link>

          <div className="flex items-center gap-1 md:gap-4">
            {/* Enlaces de texto solo en pantallas medianas y grandes */}
            <nav className="hidden items-center gap-1 md:flex" aria-label="Navegación principal">
              {tabs
                .filter((t) => t.href !== "/perfil")
                .map((tab) => (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                      isActive(pathname, tab.href)
                        ? "text-primary"
                        : "text-muted-foreground"
                    )}
                  >
                    {tab.label}
                  </Link>
                ))}
            </nav>

            {/* Carrito siempre visible, con badge de artículos */}
            <Link
              href="/carrito"
              className="touch-target flex items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent"
              aria-label={`Carrito, ${cartCount} artículos`}
            >
              <span className="relative">
                <ShoppingBag size={22} aria-hidden="true" />
                {cartCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground"
                  >
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </span>
            </Link>

            {/* Nombre del usuario o acceso, solo en ≥md (en móvil vive en la pestaña Perfil) */}
            {user ? (
              <Link
                href="/perfil"
                className="hidden max-w-40 truncate text-sm font-medium md:inline"
              >
                {user.name ?? "Mi cuenta"}
              </Link>
            ) : (
              <Link
                href="/auth/login"
                className="hidden text-sm font-medium text-primary md:inline"
              >
                Entrar
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Tab bar inferior, solo móvil */}
      <nav
        aria-label="Navegación inferior"
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background md:hidden"
      >
        <div className="grid h-16 grid-cols-4">
          {tabs.map((tab) => {
            const active = isActive(pathname, tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon size={22} aria-hidden="true" />
                <span className="text-[11px] font-medium leading-none">
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
