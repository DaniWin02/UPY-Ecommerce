// Pantalla de registro (Ágora Campus) — alta con correo institucional + contraseña.
// Server Component sin JS de cliente: el formulario usa la server action registrarse.
// Misma estética mobile-first que la pantalla de login.
import Link from "next/link";
import { AlertTriangle, GraduationCap } from "lucide-react";
import { registrarse } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Mapa de códigos de error de registrarse → mensajes en español
const MENSAJES_ERROR: Record<string, string> = {
  DominioNoPermitido:
    "Usa tu correo institucional (@alumno.upy.edu.mx / @upy.edu.mx).",
  PasswordCorta: "La contraseña debe tener al menos 8 caracteres.",
  PasswordLarga: "La contraseña no puede exceder 128 caracteres.",
  NoCoincide: "Las contraseñas no coinciden.",
  ExisteCuenta: "Ya existe una cuenta con ese correo. Inicia sesión.",
  DemasiadosIntentos: "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.",
};
const MENSAJE_ERROR_DEFAULT = "No se pudo crear la cuenta. Inténtalo de nuevo.";

// Next 15: searchParams llega como Promise y hay que hacer await
export default async function AuthRegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const mensajeError = error
    ? MENSAJES_ERROR[error] ?? MENSAJE_ERROR_DEFAULT
    : null;

  return (
    <main className="grid min-h-dvh place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="items-center text-center">
          {/* Logotipo y nombre de la app */}
          <div
            aria-hidden="true"
            className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground"
          >
            <GraduationCap className="h-7 w-7" />
          </div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">
            Crea tu cuenta
          </h1>
          <p className="text-sm text-muted-foreground">
            Únete al marketplace de tu universidad
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Banner de error mapeado a español */}
          {mensajeError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{mensajeError}</span>
            </div>
          )}

          {/* Formulario de registro → server action registrarse */}
          <form action={registrarse} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="nombre" className="text-sm font-medium">
                Nombre
              </label>
              <Input
                id="nombre"
                type="text"
                name="nombre"
                required
                autoComplete="name"
                placeholder="Tu nombre completo"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Correo institucional
              </label>
              <Input
                id="email"
                type="email"
                name="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="tu.nombre@alumno.upy.edu.mx"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Contraseña
              </label>
              <Input
                id="password"
                type="password"
                name="password"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Mínimo 8 caracteres"
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="confirmar" className="text-sm font-medium">
                Confirmar contraseña
              </label>
              <Input
                id="confirmar"
                type="password"
                name="confirmar"
                required
                minLength={8}
                autoComplete="new-password"
                placeholder="Repite tu contraseña"
                className="h-11"
              />
            </div>
            <Button type="submit" size="lg" className="w-full">
              Crear cuenta
            </Button>
          </form>

          {/* Enlace de vuelta al login */}
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link
              href="/auth/login"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Inicia sesión
            </Link>
          </p>
        </CardContent>

        <CardFooter>
          <p className="text-center text-xs text-muted-foreground">
            Acceso exclusivo para la comunidad UPY con correo institucional.
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
// Fin: pantalla de registro.
