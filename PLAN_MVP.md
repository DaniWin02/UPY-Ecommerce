# Plan MVP por fases — Ágora Campus

> **Meta del MVP:** una tienda funcional mobile-first con auth real, base de datos, marketplace con filtros por tienda, visualizador de productos, carrito, checkout SPEI/efectivo con verificación, **analytics de comportamiento** (clicks, vistas por producto, visitas a tiendas, funnel) y **mensajería interna** comprador ↔ vendedor.
>
> Basado en 3 análisis técnicos del código real (arquitectura de datos, plan de implementación, mobile-first + testing). Complementa a `PLAN.md` (visión) — este documento es la ruta de ejecución.

---

## Cómo mejora la idea original

| Tu idea | Mejora incorporada |
|---|---|
| "Análisis de clicks" | **Funnel completo medible**: búsqueda → vista tienda → vista producto → click → add-to-cart → orden → pago verificado. No solo clicks: conversión por producto y por tienda. |
| "Visualización por producto / visitas a tiendas" | Eventos crudos + **rollups diarios** (`analytics_producto_diario`, `analytics_vendor_diario`) para que el dashboard del vendedor cargue al instante; vistas medidas con IntersectionObserver (≥50% visible ≥1s), no page loads engañosos. |
| "Marketplace con filtros por tienda" | Filtros en **searchParams** (URL compartible, back button funciona) + **bottom sheet** de filtros en móvil + chips de un toque + búsqueda insensible a acentos (`unaccent`). |
| "Carrito" | Carrito **por cookie firmada validado en servidor** (cero JS extra, RSC-friendly) con soporte **multivendedor**: un checkout por tienda (cada vendedor tiene su CLABE). |
| "Mensajes internos" | Conversaciones **ligadas a producto u orden** (contexto de compra), contadores de no-leídos sin N+1, y moderación mínima (bloqueo + reportes) — necesaria en una comunidad universitaria. |
| "Mobile first" | **Bottom tab bar** (Inicio·Explorar·Drops·Pedidos·Perfil), CTA fijo inferior, checkout de una página, subir comprobante desde cámara O galería, **PWA instalable** (sin service worker), presupuesto LCP ≤ 2.5s. |
| (no pedido) | **Privacidad by-design**: no se persisten IPs ni user-agents en analytics; rollups sin user_id; retención 180 días de eventos crudos. |
| (no pedido) | **Testing + CI**: Vitest + Playwright móvil + GitHub Actions — el profesor despliega vía Actions, el repo debe estar verde. |

---

## ⚠️ Deuda del skeleton detectada (se paga en Fase 0)

Bugs confirmados por análisis de código que **bloquean** el MVP si no se corrigen primero:

1. **Estados de pago desalineados**: `state-machine.ts` usa `comprobante_subido|en_revision`; el pgEnum de BD usa `enviado`. → La BD manda; tipar desde el enum.
2. **Tablas Auth.js incompatibles con `@auth/drizzle-adapter`**: a `users` le faltan `name/emailVerified/image` (rompe en runtime con magic link); a `accounts` le faltan 7 columnas de tokens.
3. **Bug de dominios**: `.env.example` trae `@uni.mx` con `@`, pero `isEmailDomainAllowed` compara sin `@` → nadie podría entrar.
4. **Middleware que nunca bloquea**: cuando la IP no está permitida hace `return undefined` (deja pasar). Y `ipInCidr` siempre devuelve `false`.
5. **`stock_holds.order_id` sin FK** (ciclo de imports) → mover `stockHolds` a `orders.ts`.
6. **`verification_tokens._placeholder`**: columna basura que se colaría en la migración 0000.
7. **Sin camino de estados para EFECTIVO**: falta `pendiente_pago → pago_verificado` (pagar al entregar).
8. **Sample data incompatible con el esquema** (IDs no-UUID, `estado: "publicado"` inexistente, columnas planas vs jsonb) → el seed transforma, no inserta crudo.
9. **Design tokens inexistentes**: los componentes usan `bg-primary`, `text-muted-foreground`… pero `globals.css`/`tailwind.config.ts` no definen ninguna variable → **hoy los componentes no tienen estilo real**.
10. **No existe tabla `carts`** (PLAN.md la menciona; el esquema no) y `orders.estado` default `"carrito"` sobra con la decisión de carrito-cookie.

---

# FASES

## Fase 0 — Fundaciones (deuda + tema + CI base) · Esfuerzo S/M

**Objetivo:** repo sano sobre el que todo lo demás se construye sin retrabajos.

- Corregir los 10 puntos de deuda de arriba (esquema, state machine, env parsing, middleware honesto).
- **Design tokens**: bloque completo de variables shadcn (`:root` + `.dark`) en `globals.css` incl. `--success`/`--warning` (la plataforma vive de estados de pago), mapeo en `tailwind.config.ts`, `tailwindcss-animate`, `next-themes`, fuente Inter vía `next/font`, `viewport-fit=cover` + utilidades safe-area.
- **Testing harness**: Vitest 3 (projects unit/integration) + primeros tests de `state-machine` e `ip-rules` (código puro, valor inmediato).
- **CI GitHub Actions** (`.github/workflows/ci.yml`): jobs `lint-types` (lint + `tsc --noEmit`) y `unit` — repo verde desde el día 1; se amplía en fases posteriores.

**DoD:** `next build` + `vitest run` + CI verdes; componentes se ven con tema real; state machine cubre efectivo.

## Fase 1 — Base de datos viva (migraciones + seed) · Esfuerzo M

**Objetivo:** PostgreSQL real con el esquema completo y datos de muestra navegables.

- Nuevos dominios de esquema: **`analytics.ts`** (`analytics_events` + rollups diarios producto/vendor, índices `(tipo,fecha)`, `(product_id,fecha)`, `(vendor_id,fecha)`, BRIN en `created_at`) y **`messaging.ts`** (`conversations` denormalizada comprador/vendor con contadores no-leídos, `messages`, `user_blocks`, `message_reports`). CHECK `reservado <= stock` en `inventory`. Migración custom para extensión `unaccent`.
- Primera migración `drizzle-kit generate` + `db:migrate`.
- **`scripts/seed.ts`** (tsx): transforma `data/samples/` → BD (mapa id→UUID, mapeos de enums/columnas).
- Tests de integración base contra Postgres (service container en CI).

**DoD:** `db:migrate && db:seed` deja una BD consultable; CI corre integración con Postgres 16.

## Fase 2 — Autenticación y comunidad · Esfuerzo L

**Objetivo:** solo la comunidad @uni entra; roles funcionando.

- Activar Auth.js v5: `DrizzleAdapter` (con mapeo explícito de tablas), Google OAuth (`AUTH_GOOGLE_*`) + magic link con **provider Resend nativo**; sesión `strategy: "database"` (revocable — comunidad cerrada); callback `signIn` con dominios permitidos.
- Helpers `src/lib/session.ts`: `requireUser()`, `requireRole()`, `requireVendorMember(vendorId)`.
- Proteger layouts `vendor/` y `admin/` **en servidor (layout), no en middleware** (sesión database no es edge-friendly).
- Login móvil real en `/auth/login`; página `/bloqueado`.
- Provider Credentials **solo bajo `E2E_TEST_MODE`** para Playwright (nunca en producción).

**DoD:** login Google con dominio permitido entra, dominio ajeno rechazado; vendor/admin inaccesibles sin rol; E2E de auth-gate verde.

## Fase 3 — Marketplace navegable (catálogo + shell móvil) · Esfuerzo L/XL

**Objetivo:** la experiencia de "tienda" completa en lectura, mobile-first.

- **AppShell**: bottom tab bar 5 destinos (Inicio·Explorar·Drops·Pedidos·Perfil) con badges, degrada a topbar desktop; carrito como icono en header (no tab).
- **Catálogo**: grid 2-col móvil, filtros por tienda/tipo/precio en bottom sheet + chips, búsqueda `ILIKE + unaccent`, todo en searchParams (RSC).
- **Tienda** (`/tienda/[slug]`): cabecera del vendedor, productos, botón seguir.
- **Ficha de producto**: galería scroll-snap nativa (sin librería), selector de variantes con chips, stock disponible (`stock - reservado`), CTA fijo inferior.
- **Imágenes**: R2/S3 con presigned URLs (`src/lib/storage.ts`), `next/image` + `remotePatterns` + `sizes` explícitos, aspect ratios reservados (CLS ≤ 0.1).
- **CRUD mínimo de productos del vendedor** (sin él no hay catálogo administrable).

**DoD:** flujo explorar → filtrar → tienda → producto fluido en viewport 412px; Lighthouse móvil LCP ≤ 2.5s en catálogo; E2E de navegación móvil verde.

## Fase 4 — Carrito · Esfuerzo S/M

**Objetivo:** carrito confiable sin fricción.

- Cookie firmada `[{variantId, qty}]` + Server Actions (add/update/remove); precios y stock SIEMPRE re-validados en servidor.
- Página `/carrito` **agrupada por vendedor** (anticipa checkout por tienda); badge en header.
- Eliminar `"carrito"` de `orderEstadoEnum` (la orden nace en `pendiente_pago`).

**DoD:** agregar desde ficha, editar cantidades, persistencia entre sesiones del dispositivo; unit tests de la lógica de cookie.

## Fase 5 — Checkout + pagos verificados (el corazón) · Esfuerzo XL

**Objetivo:** se puede VENDER de verdad.

- **Creación de orden transaccional** con reserva atómica de stock: `UPDATE inventory SET reservado = reservado + qty WHERE stock - reservado >= qty` dentro de `db.transaction` (row-lock serializa checkouts concurrentes; el CHECK de Fase 1 es cinturón extra). Referencia única legible `AG-XXXX-XX`, expiración configurada.
- **Checkout móvil de una página**: entrega (aula del vendedor por defecto / punto) → método (SPEI/efectivo) → confirmar. Un checkout por vendedor.
- **Hub del pedido** (`/pedidos/[orderId]`): `PaymentInstructions` con copiar-CLABE/referencia real (`navigator.clipboard` + feedback), `ComprobanteUploader` con **dos botones** (cámara / galería-PDF — `capture` único bloquea galería en Android), compresión cliente ~1600px, cronómetro de expiración, `OrderTimeline` con polling `router.refresh()` 30s.
- **Cola de verificación del vendedor** (pantalla default de `/vendor` en móvil): comprobante ampliable, monto declarado vs total, Verificar/Rechazar; rechazo → re-subir.
- **Efectivo**: verificar+entregar en un paso.
- **pg-boss** vía `instrumentation.ts`: job `expirar-ordenes-sin-pago` por orden (`startAfter`) + sweep cada 10 min; liberación de reservas con guard de estado.
- **Notificaciones**: email (Resend fetch directo) + fila en `notifications` en cada transición.

**DoD:** E2E completos verdes: comprador feliz SPEI, vendedor verifica, rechazo→re-subida, expiración libera stock, carrito multivendedor, efectivo. Tests de integración de la transacción de reserva (incl. concurrencia).

## Fase 6 — Analytics (tracking + dashboards) · Esfuerzo L

**Objetivo:** el diferenciador analítico: cada vendedor ve cómo rinde su tienda.

- **Cliente**: `src/lib/analytics.ts` — cola en memoria, batch (20 eventos / 15s / `visibilitychange`), `navigator.sendBeacon` + fallback `fetch keepalive`; hooks `useTrackEvent` / `useTrackImpression` (IntersectionObserver ≥50% ≥1s, dedupe por sesión); `<PageViewTracker>`.
- **Servidor**: `POST /api/events` → INSERT multi-fila; eventos `orden_creada`/`pago_verificado` emitidos servidor-side junto a la transición de estado (funnel en una sola tabla).
- **Rollups**: job pg-boss nocturno con UPSERT (re-ejecutable para backfill); "hoy" se consulta crudo (indexado) + histórico del rollup.
- **Dashboard del vendedor** (`/vendor/analytics`): KPIs 2×2 (visitas tienda, vistas producto, conversión, ingreso verificado), top productos, barras de 7 días **con divs Tailwind (sin librería de charts en MVP)**, funnel simple.
- **Privacidad**: sin IP/UA persistidos, `referrer` solo interno, rollups sin `user_id`, retención 180 días (job de purga), vendors solo ven agregados.

**DoD:** navegar la tienda produce eventos verificables; dashboard del vendedor con datos reales del seed + navegación; unit tests del batching.

## Fase 7 — Mensajería interna · Esfuerzo M/L

**Objetivo:** cerrar el loop social comprador ↔ vendedor.

- Rutas `/mensajes` + `/mensajes/[chatId]` (móvil: pantallas apiladas; desktop: maestro-detalle) + API `conversations` / `messages`.
- Botón "Preguntar al vendedor" en ficha de producto y en pedido (crea/reusa conversación con contexto).
- No-leídos por contadores denormalizados (badge = un SELECT); **polling** 10s en hilo abierto, 60s para badge (SSE queda a V1 junto con drops).
- Moderación mínima: bloquear usuario, reportar mensaje → cola del superadmin (mismo patrón que verificación de pagos).

**DoD:** conversación completa producto→pregunta→respuesta con no-leídos correctos; E2E del flujo de mensaje.

## Fase 8 — Hardening + PWA + QA final · Esfuerzo M

**Objetivo:** listo para usuarios reales.

- `ipInCidr` real (IPv4 + `::ffff:` mapeadas) con unit tests exhaustivos; middleware que **sí** redirige a `/bloqueado`; gate global por `CAMPUS_CIDRS` (env) en middleware, reglas de BD en layouts admin/vendor; parsing confiable de `x-forwarded-for` (anti-spoof).
- Rate limiting en memoria: magic links, creación de órdenes, subida de comprobantes.
- Validación Zod uniforme en todos los handlers (`drizzle-zod` + helper 422).
- **PWA mínima**: manifest + iconos (instalable) — sin service worker (footgun de caché con drops).
- A11y: `@axe-core/playwright` en 6 rutas clave (falla solo critical/serious).
- Pasada final de performance (LCP/CLS/INP) y revisión de código con agentes antes del release.

**DoD:** suite completa verde en CI (lint, types, unit, integration, E2E móvil, a11y); instalable en home screen; gate IP demostrable on/off.

---

## Dependencias entre fases

```
F0 ──► F1 ──► F2 ──► F4 ──► F5 ──► F6 (dashboards necesitan funnel completo)
        │      │                    │
        └─► F3 ┘ (catálogo demo-able con solo F1+seed)   F7 (necesita F2+F3)
                                                          F8 (transversal, al final)
```

Primer hito demo-able: **F0+F1+F3** (marketplace navegable con datos). Primer "se puede vender": **cierre de F5**.

## Resumen de esfuerzo

| Fase | Esfuerzo | Entrega visible |
|---|---|---|
| 0. Fundaciones | S/M | Tema visual + CI verde |
| 1. BD viva | M | Esquema completo + seed |
| 2. Auth | L | Login @uni + roles |
| 3. Marketplace | L/XL | Tienda navegable móvil |
| 4. Carrito | S/M | Carrito multivendedor |
| 5. Checkout SPEI | XL | **Se puede vender** |
| 6. Analytics | L | Dashboard del vendedor |
| 7. Mensajería | M/L | Chat comprador↔vendedor |
| 8. Hardening | M | Gate IP + PWA + QA |

## Qué se instala (resumen)

- **Runtime:** `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (R2), `next-themes`, `tailwindcss-animate`, `tsx` (dev, seed).
- **Testing:** `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@playwright/test`, `@axe-core/playwright`.
- **Explícitamente NO en MVP:** recharts, vaul, next-pwa/serwist, testcontainers, PostHog/GA, websockets.

## Fuera de alcance del MVP (→ V1)

Drops con cuenta regresiva realtime (SSE), preventas por umbral, compras grupales por aula, wishlist colaborativa, WhatsApp, OCR de comprobantes con Claude, gamificación, reglas `ip_rules` dinámicas completas, dark mode pulido (los tokens quedan listos).
