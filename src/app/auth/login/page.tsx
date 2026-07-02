// Pantalla de acceso (Ágora Campus) — login PRIMARIO con correo institucional
// + contraseña (auth propio). Google y magic link son opcionales por env.
// Server Component sin JS de cliente: todos los formularios usan Server Actions.
import Link from "next/link";
import { signIn } from "@/lib/auth";
import { loginConCredenciales } from "@/lib/auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Mapa de códigos de error (Auth.js + auth propio) → mensajes en español
const MENSAJES_ERROR: Record<string, string> = {
  CredencialesInvalidas: "Correo o contraseña incorrectos.",
  DemasiadosIntentos: "Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.",
  AccessDenied: "Solo puede entrar la comunidad universitaria (correo institucional).",
  Verification: "El enlace expiró o ya fue usado. Pide uno nuevo.",
  OAuthAccountNotLinked: "Ese correo ya está vinculado con otro método de acceso.",
};
const MENSAJE_ERROR_DEFAULT = "No se pudo iniciar sesión. Inténtalo de nuevo.";

// Logo de Google en SVG inline (colores oficiales)
function GoogleLogo() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.86c2.26-2.09 3.56-5.17 3.56-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.19 7.19 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A11.99 11.99 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

// Next 15: searchParams llega como Promise y hay que hacer await
export default async function AuthLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; enviado?: string }>;
}) {
  const { error, enviado } = await searchParams;
  const mensajeError = error
    ? MENSAJES_ERROR[error] ?? MENSAJE_ERROR_DEFAULT
    : null;

  // Métodos secundarios, condicionales por env (misma condición con la que
  // auth.ts registra cada provider): sin la env, el bloque no se muestra.
  const googleDisponible = Boolean(process.env.AUTH_GOOGLE_ID);
  const magicLinkDisponible = Boolean(process.env.RESEND_API_KEY);

  // Server Action: inicio de sesión con Google (dominio institucional se valida en Auth.js)
  async function entrarConGoogle() {
    "use server";
    await signIn("google", { redirectTo: "/" });
  }

  // Server Action: envío de enlace mágico por correo (Resend)
  // Auth.js redirige a /auth/login?enviado=1 al mandar el enlace
  async function enviarEnlace(formData: FormData) {
    "use server";
    await signIn("resend", formData);
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          {/* Logotipo y nombre de la app */}
          <span className="text-4xl" role="img" aria-label="Ágora Campus">
            🏛️
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Ágora Campus</h1>
          <p className="text-sm text-muted-foreground">
            El marketplace de tu universidad
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Banner de éxito: enlace enviado */}
          {enviado === "1" && (
            <div
              role="status"
              className="rounded-md border border-success/30 bg-success/10 p-3 text-sm text-success"
            >
              Te enviamos un enlace de acceso. Revisa tu correo institucional.
            </div>
          )}

          {/* Banner de error mapeado a español */}
          {mensajeError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {mensajeError}
            </div>
          )}

          {/* Método PRIMARIO: correo institucional + contraseña (auth propio) */}
          <form action={loginConCredenciales} className="space-y-3">
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
                autoComplete="current-password"
                placeholder="Tu contraseña"
                className="h-11"
              />
            </div>
            <Button type="submit" size="lg" className="w-full">
              Entrar
            </Button>
          </form>

          {/* Enlace al registro */}
          <p className="text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <Link
              href="/auth/registro"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Crea una
            </Link>
          </p>

          {/* Separador de métodos alternativos (solo si hay alguno configurado) */}
          {(googleDisponible || magicLinkDisponible) && (
            <div className="flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">o también</span>
              <span className="h-px flex-1 bg-border" />
            </div>
          )}

          {/* Acceso con Google: solo si el OAuth está configurado */}
          {googleDisponible && (
            <form action={entrarConGoogle}>
              <Button
                type="submit"
                variant="secondary"
                size="lg"
                className="w-full"
              >
                <GoogleLogo />
                Continuar con Google
              </Button>
            </form>
          )}

          {/* Magic link por correo: solo si Resend está configurado */}
          {magicLinkDisponible && (
            <form action={enviarEnlace} className="space-y-3">
              <label htmlFor="email-enlace" className="sr-only">
                Correo institucional para el enlace de acceso
              </label>
              <Input
                id="email-enlace"
                type="email"
                name="email"
                required
                autoComplete="email"
                inputMode="email"
                placeholder="tu.nombre@alumno.upy.edu.mx"
                className="h-11"
              />
              <Button
                type="submit"
                variant="secondary"
                size="lg"
                className="w-full"
              >
                Enviarme un enlace de acceso
              </Button>
            </form>
          )}
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
// Fin: pantalla de acceso.
