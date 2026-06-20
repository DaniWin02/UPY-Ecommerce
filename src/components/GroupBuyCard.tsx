import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export interface GroupBuyCardProps {
  /** Título de la compra grupal */
  titulo: string;
  /** Aula o grupo al que pertenece */
  aula: string;
  /** Participantes actuales */
  actuales: number;
  /** Meta de participantes para activar el precio grupal */
  meta: number;
  /** Fecha límite para unirse */
  fechaLimite: Date | string;
  onUnirse?: () => void;
}

export function GroupBuyCard({
  titulo,
  aula,
  actuales,
  meta,
  fechaLimite,
  onUnirse,
}: GroupBuyCardProps) {
  // TODO: calcular tiempo restante hasta fechaLimite y deshabilitar al alcanzar la meta
  const progreso = meta > 0 ? Math.min(100, Math.round((actuales / meta) * 100)) : 0;
  void fechaLimite;

  return (
    <Card>
      <CardHeader>
        <h3 className="text-sm font-semibold">{titulo}</h3>
        <p className="text-xs text-muted-foreground">{`Aula ${aula}`}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          {/* TODO: animar barra de progreso */}
          <div className="h-full bg-primary" style={{ width: `${progreso}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          {`${actuales} de ${meta} para activar el precio grupal`}
        </p>
        {/* TODO: mostrar cuenta regresiva de la fecha límite */}
      </CardContent>
      <CardFooter>
        <Button className="w-full" onClick={onUnirse}>
          Unirse
        </Button>
      </CardFooter>
    </Card>
  );
}
