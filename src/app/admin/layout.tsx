// Layout del panel de universidad (Ágora — SuperAdmin)
// Protegido por rol superadmin. Con ADMIN_SOLO_IP_CAMPUS="true" exige además
// que la IP del request esté permitida para el panel admin (campus por env
// O reglas allow/deny de BD con scope admin, ver @/lib/ip-rules-db),
// independientemente de que el gate global IP_GATE_ENABLED esté apagado.
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  Flag,
  LayoutDashboard,
  Network,
  Settings,
  Store,
  Users,
} from "lucide-react";
import { extraerIpCliente } from "@/lib/ip-rules";
import { ipPermitidaParaAdmin } from "@/lib/ip-rules-db";
import { requireRole } from "@/lib/session";

// Enlaces del panel de administración (nav horizontal, scrolleable en móvil).
const NAV_LINKS = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard },
  { href: "/admin/vendors", label: "Tiendas", icon: Store },
  { href: "/admin/usuarios", label: "Usuarios", icon: Users },
  { href: "/admin/reportes", label: "Reportes", icon: Flag },
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

  // Candado opcional por red para el panel admin.
  // Se usa ipPermitidaParaAdmin (campus por env O regla allow de BD con scope
  // admin, menos denies) y NO isIpAllowed, porque esta última devuelve true
  // para todo cuando el gate global está APAGADO y este check debe funcionar
  // de forma independiente al gate.
  if (process.env.ADMIN_SOLO_IP_CAMPUS === "true") {
    const cabeceras = await headers();
    const ip =
      extraerIpCliente(
        cabeceras.get("x-forwarded-for"),
        Number(process.env.TRUSTED_PROXIES ?? "0")
      ) ?? "0.0.0.0";
    if (!(await ipPermitidaParaAdmin(ip))) redirect("/bloqueado");
  }

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
