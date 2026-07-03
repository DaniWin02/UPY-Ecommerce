// Perfil del usuario (RSC): datos de cuenta, accesos rápidos y cierre de sesión.
// Requiere sesión activa (requireUser redirige a login si no la hay).
import Link from "next/link";
import { eq } from "drizzle-orm";
import {
  ChevronRight,
  LogOut,
  MessageSquare,
  Package,
  ShieldCheck,
  Store,
} from "lucide-react";
import { db } from "@/db";
import { vendorMembers, vendors } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { conteoNoLeidos } from "@/lib/messaging";
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

  // Tiendas donde el usuario es miembro (owner o staff) + mensajes sin leer.
  const [misTiendas, noLeidos] = await Promise.all([
    db
      .select({ id: vendors.id, nombre: vendors.nombre })
      .from(vendorMembers)
      .innerJoin(vendors, eq(vendorMembers.vendorId, vendors.id))
      .where(eq(vendorMembers.userId, user.id)),
    conteoNoLeidos(user.id),
  ]);

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
            <h1 className="font-heading text-lg font-semibold tracking-tight">
              {user.name ?? "Sin nombre"}
            </h1>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Badge variant="secondary">
            {rolLabels[user.rolGlobal] ?? user.rolGlobal}
          </Badge>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Accesos rápidos: filas dentro de una sola Card con divide-y */}
          <div className="divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
            <Link
              href="/pedidos"
              className="flex h-12 cursor-pointer items-center gap-3 px-4 text-sm font-medium transition-colors hover:bg-muted/50"
            >
              <Package className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 truncate">Mis pedidos</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>

            <Link
              href="/mensajes"
              className="flex h-12 cursor-pointer items-center gap-3 px-4 text-sm font-medium transition-colors hover:bg-muted/50"
            >
              <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 truncate">Mensajes</span>
              {noLeidos > 0 && (
                <span
                  aria-label={`${noLeidos} mensajes sin leer`}
                  className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground"
                >
                  {noLeidos}
                </span>
              )}
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>

            {misTiendas.map((tienda) => (
              <Link
                key={tienda.id}
                href="/vendor/productos"
                className="flex h-12 cursor-pointer items-center gap-3 px-4 text-sm font-medium transition-colors hover:bg-muted/50"
              >
                <Store className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 truncate">Mi tienda: {tienda.nombre}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}

            {user.rolGlobal === "superadmin" && (
              <Link
                href="/admin/vendors"
                className="flex h-12 cursor-pointer items-center gap-3 px-4 text-sm font-medium transition-colors hover:bg-muted/50"
              >
                <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 truncate">Panel de administración</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
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
