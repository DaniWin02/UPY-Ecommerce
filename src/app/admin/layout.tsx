// Layout del panel de universidad (Ágora — SuperAdmin)
// Protegido por rol superadmin. La exigencia adicional de IP interna
// (gate por red universitaria) llega en Fase 8.
import Link from "next/link";
import { Network, Settings, Store } from "lucide-react";
import { requireRole } from "@/lib/session";

// Enlaces del panel de administración (nav horizontal, scrolleable en móvil).
const NAV_LINKS = [
  { href: "/admin/vendors", label: "Vendors", icon: Store },
  { href: "/admin/reglas-ip", label: "Reglas IP", icon: Network },
  { href: "/admin/config", label: "Config", icon: Settings },
] as const;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Solo superadmin: anónimo → login; otro rol → home.
  await requireRole("superadmin");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 pt-3">
          <h1 className="font-heading text-base font-semibold tracking-tight">
            Panel de universidad
          </h1>
          {/* Nav móvil-first: pestañas con borde inferior, scroll horizontal sin scrollbar */}
          <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:border-primary hover:text-foreground"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-4">{children}</main>
    </div>
  );
}
// Fin: layout del panel de universidad.
