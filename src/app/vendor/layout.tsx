// Layout del panel del vendedor (Ágora)
// Protegido: solo miembros de algún vendor (owner/staff) o superadmin.
import Link from "next/link";
import { BarChart3, ClipboardList, Flame, Package, ReceiptText } from "lucide-react";
import { requireVendorMember } from "@/lib/session";

// Enlaces del panel del vendedor (nav horizontal, scrolleable en móvil).
const NAV_LINKS = [
  { href: "/vendor/productos", label: "Productos", icon: Package },
  { href: "/vendor/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/vendor/comprobantes", label: "Comprobantes", icon: ReceiptText },
  { href: "/vendor/drops", label: "Drops", icon: Flame },
  { href: "/vendor/analytics", label: "Analytics", icon: BarChart3 },
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
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <h1 className="font-heading text-base font-semibold tracking-tight">
              Panel del vendedor
            </h1>
            {vendorActual && (
              <span className="truncate text-sm text-muted-foreground">
                {vendorActual}
              </span>
            )}
          </div>
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
// Fin: layout del panel del vendedor.
