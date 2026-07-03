// Panel admin — reglas CIDR y switch del gate global de IP
import { Network } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminReglasIpPage() {
  return (
    <main className="grid place-items-center py-12">
      {/* TODO: administrar reglas CIDR (allow/deny por scope) y el switch del gate global IP_GATE_ENABLED (feature flag) */}
      <Card className="w-full max-w-md shadow-sm">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-muted">
            <Network className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <h1 className="font-heading text-lg font-semibold tracking-tight">
            Reglas de IP
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Esta sección llega en la siguiente fase.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
// Fin: administración de reglas de IP.
