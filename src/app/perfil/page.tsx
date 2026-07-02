// Perfil del usuario (RSC): datos de cuenta, accesos rápidos y cierre de sesión.
// Requiere sesión activa (requireUser redirige a login si no la hay).
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ChevronRight, LogOut } from "lucide-react";
import { db } from "@/db";
import { vendorMembers, vendors } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { cerrarSesion } from "@/lib/auth-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

// Rol global → etiqueta en español para el Badge.
const rolLabels: Record<string, string> = {
  comprador: "Comunidad",
  vendor: "Vendedor",
  superadmin: "Administración",
};

export default async function PerfilPage() {
  const user = await requireUser();

  // Tiendas donde el usuario es miembro (owner o staff).
  const misTiendas = await db
    .select({ id: vendors.id, nombre: vendors.nombre })
    .from(vendorMembers)
    .innerJoin(vendors, eq(vendorMembers.vendorId, vendors.id))
    .where(eq(vendorMembers.userId, user.id));

  const inicial = (user.name?.trim().charAt(0) || user.email.charAt(0)).toUpperCase();

  return (
    <main className="px-4 py-6">
      <Card className="mx-auto w-full max-w-lg">
        <CardHeader className="items-center gap-2 text-center">
          {/* Avatar con la inicial del usuario */}
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-semibold text-primary">
            {inicial}
          </div>
          <div>
            <h1 className="text-lg font-semibold">{user.name ?? "Sin nombre"}</h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Badge variant="secondary">
            {rolLabels[user.rolGlobal] ?? user.rolGlobal}
          </Badge>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Accesos rápidos */}
          <div className="divide-y overflow-hidden rounded-lg border">
            <Link
              href="/pedidos"
              className="touch-target flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-accent"
            >
              Mis pedidos
              <ChevronRight size={18} className="text-muted-foreground" aria-hidden="true" />
            </Link>

            <div
              aria-disabled="true"
              className="touch-target flex items-center justify-between px-4 py-3 text-sm font-medium text-muted-foreground"
            >
              Mensajes (próximamente)
              <ChevronRight size={18} className="opacity-40" aria-hidden="true" />
            </div>

            {misTiendas.map((tienda) => (
              <Link
                key={tienda.id}
                href="/vendor/productos"
                className="touch-target flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-accent"
              >
                <span className="truncate">Mi tienda: {tienda.nombre}</span>
                <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}

            {user.rolGlobal === "superadmin" && (
              <Link
                href="/admin/vendors"
                className="touch-target flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-accent"
              >
                Panel de administración
                <ChevronRight size={18} className="text-muted-foreground" aria-hidden="true" />
              </Link>
            )}
          </div>

          {/* Cierre de sesión (server action) */}
          <form action={cerrarSesion}>
            <Button type="submit" variant="outline" className="w-full">
              <LogOut size={16} aria-hidden="true" />
              Cerrar sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
