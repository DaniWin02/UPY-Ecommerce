// Panel admin — aprobar/gestionar vendedores y su CLABE
import { Store } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminVendorsPage() {
  return (
    <main className="grid place-items-center py-12">
      {/* TODO: aprobar/gestionar vendedores (facultad/club/emprendimiento) y validar su CLABE para depósitos */}
      <Card className="w-full max-w-md shadow-sm">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
            <Store className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <h1 className="font-heading text-lg font-semibold tracking-tight">
            Vendedores
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Esta sección llega en la siguiente fase.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
// Fin: gestión de vendedores.
