// Layout del panel del vendedor (Ágora)
// Protegido: solo miembros de algún vendor (owner/staff) o superadmin.
import Link from "next/link";
import { requireVendorMember } from "@/lib/session";

// Enlaces del panel del vendedor (nav horizontal, scrolleable en móvil).
const NAV_LINKS = [
  { href: "/vendor/productos", label: "Productos" },
  { href: "/vendor/pedidos", label: "Pedidos" },
  { href: "/vendor/comprobantes", label: "Comprobantes" },
  { href: "/vendor/drops", label: "Drops" },
] as const;

export default async function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Exige sesión + membresía en vendor_members (superadmin pasa aunque
  // no tenga membresías; en ese caso memberships llega vacío).
  const { memberships } = await requireVendorMember();

  // Nombre del vendor de la primera membresía (si existe) para el encabezado.
  const vendorActual = memberships[0]?.nombre ?? null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="text-sm font-semibold">Panel del vendedor</h1>
            {vendorActual && (
              <span className="truncate text-sm text-muted-foreground">
                {vendorActual}
              </span>
            )}
          </div>
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
// Fin: layout del panel del vendedor.
