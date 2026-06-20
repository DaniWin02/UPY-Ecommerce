import type { NextConfig } from "next";

// Configuración de Next.js para Ágora Campus.
const nextConfig: NextConfig = {
  // TODO: Habilitar dominios remotos para imágenes de producto y comprobantes
  //       (almacenamiento S3/R2 con URLs firmadas). Ej.:
  // images: {
  //   remotePatterns: [
  //     { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
  //   ],
  // },

  // NOTA: El gate global por IP (CIDR del campus) NO se configura aquí.
  //       Vive en src/middleware.ts, que lee `x-forwarded-for` y evalúa
  //       las reglas CIDR según el feature flag IP_GATE_ENABLED.
  //       En self-host hay que configurar `trust proxy` para ver la IP real.

  // TODO: Ajustar opciones experimentales según se necesiten (serverActions, etc.).
};

export default nextConfig;
