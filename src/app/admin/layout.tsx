// Layout del panel de universidad (Ágora — SuperAdmin)
// Protegido por rol superadmin. La exigencia adicional de IP interna
// (gate por red universitaria) llega en Fase 8.
import Link from "next/link";
import { requireRole } from "@/lib/session";

// Enlaces del panel de administración (nav horizontal, scrolleable en móvil).
const NAV_LINKS = [
  { href: "/admin/vendors", label: "Vendors" },
  { href: "/admin/reglas-ip", label: "Reglas IP" },
  { href: "/admin/config", label: "Config" },
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
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3">
          <h1 className="text-sm font-semibold">Panel de universidad</h1>
          {/* Nav móvil-first: fila horizontal con scroll en pantallas pequeñas */}
          <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-4">{children}</main>
    </div>
  );
}
// Fin: layout del panel de universidad.
