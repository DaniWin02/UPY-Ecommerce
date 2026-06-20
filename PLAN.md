# Ágora Campus — Plan de plataforma de ecommerce universitario

> **Codename:** *Ágora* (formal) / *Tianguis Digital* (con sabor local).
> **Una línea:** Un marketplace interno y social del campus, donde facultades, clubes y emprendimientos de alumnos venden a la comunidad verificada, con pagos por efectivo/SPEI validados manualmente y mecánicas de *drops* que generan comunidad.

---

## 1. Concepto y posicionamiento

No es una tienda: es la **plaza comercial digital de la universidad**. Tres ideas la hacen "no ordinaria":

1. **Multivendedor interno** — cada facultad/club/emprendimiento tiene su propio escaparate, pero todo vive bajo una sola marca y un solo carrito.
2. **Cerrado y confiable** — solo entra la comunidad (login institucional) y, opcionalmente, solo desde la red del campus (control por IP). Eso permite cosas que un ecommerce público no puede: precios solo-comunidad, entrega por aula, confianza alta.
3. **Social y por oleadas (drops)** — no compras "cuando quieras"; hay lanzamientos, preventas, listas de espera y **compras grupales por aula**. Genera urgencia sana y sentido de pertenencia.

---

## 2. Stack técnico (alineado a tu stack actual)

| Capa | Elección | Por qué |
|---|---|---|
| Framework | **Next.js (App Router) + RSC + TypeScript** | Tu stack de siempre; ideal para SEO interno, velocidad y server actions. |
| Base de datos | **PostgreSQL** | Lo que ya usas (`pg`). Multivendedor por `vendor_id` (row-level), no DB por tienda. |
| ORM | **Drizzle** (+ `drizzle-zod`) | Type-safe sobre Postgres, encaja con Zod. (Alt: Prisma.) |
| UI | **Tailwind + shadcn/ui (Radix)** | Lo que ya usas; accesible y rápido de componer. |
| Validación | **Zod** | Esquemas compartidos cliente/servidor. |
| Auth | **Auth.js v5** con SSO (Microsoft Entra ID o Google Workspace) restringido a dominios `@uni`, con **OTP por correo** como respaldo | La mayoría de universidades MX usan Microsoft/Google. Cierra la comunidad de forma limpia. |
| Almacenamiento | **S3 compatible** (Cloudflare R2 / Supabase Storage / MinIO self-host) + URLs firmadas | Imágenes de producto y **comprobantes** de pago. |
| Jobs / colas | **pg-boss** (corre sobre el mismo Postgres) | Expiración de pagos, agenda de drops, notificaciones. Sin infra extra. |
| Realtime | **Postgres LISTEN/NOTIFY → SSE** (o Ably/Pusher si escala) | Cuenta regresiva de drops y stock en vivo. |
| Notificaciones | **Resend** (correo) + **WhatsApp** (Meta Cloud API / Twilio) | WhatsApp es clave en MX para avisar "pago verificado / pedido listo". |
| Middleware IP | Next.js middleware + reglas CIDR | Control de acceso por red interna (ver §6). |
| Deploy | Vercel + Postgres administrado (Neon/Supabase) **o** VPS self-host en campus | Self-host facilita el control por IP real del cliente. |

---

## 3. Roles y actores

- **SuperAdmin (Universidad):** aprueba vendedores, define comisiones, gestiona reglas de IP, ve todo.
- **Vendor Owner (facultad/club/emprendimiento):** administra su tienda, productos, drops y verifica pagos de sus pedidos.
- **Vendor Staff:** ayuda al owner (publicar, atender cola de comprobantes, marcar entregas).
- **Comprador (comunidad):** alumno/docente/staff verificado.
- **Punto de entrega / Cajero (opcional):** confirma entrega en efectivo y recepción física.

---

## 4. Modelo de datos (tablas clave)

```
institutions        (id, nombre, dominios[], config)
users               (id, email, rol_global, institution_id, verificado_en)
vendors             (id, slug, nombre, tipo[facultad|club|emprendimiento], clabe, estado)
vendor_members      (vendor_id, user_id, rol[owner|staff])
products            (id, vendor_id, nombre, descripcion, estado, tipo[fisico|preventa|drop])
product_variants    (id, product_id, sku, atributos{talla,color}, precio, precio_comunidad)
inventory           (variant_id, stock, reservado)
stock_holds         (id, variant_id, order_id, cantidad, expira_en)   -- reserva mientras se paga
carts / cart_items
orders              (id, comprador_id, vendor_id, estado, total, referencia_pago, expira_en)
order_items         (order_id, variant_id, cantidad, precio_unit)
payments            (id, order_id, metodo[efectivo|spei], referencia, comprobante_url,
                     monto_declarado, estado[pendiente|enviado|verificado|rechazado], verificado_por)
drops               (id, vendor_id, titulo, inicia_en, termina_en, stock_total, reglas)
drop_products       (drop_id, product_id)
preorders           (id, product_id, meta_unidades, fecha_limite, estado)
waitlists           (variant_id, user_id, creado_en)
group_buys          (id, product_id, aula/grupo, lider_id, meta_cantidad, fecha_limite, estado)
group_buy_members   (group_buy_id, user_id, cantidad, payment_id)
wishlists / wishlist_collaborators
follows             (user_id, vendor_id)            -- seguir tiendas
notifications       (user_id, tipo, payload, leido)
ip_rules            (id, scope[global|admin|vendor], cidr, accion[allow|deny], prioridad)
audit_log           (actor_id, accion, entidad, antes, despues, ts)
```

---

## 5. El corazón: pagos manuales (efectivo + SPEI + comprobante)

Sin pasarela ⇒ el reto es **reservar stock, conciliar pagos a mano y evitar fraude con comprobantes falsos**. Máquina de estados del pedido:

```
carrito
  → pendiente_pago        (se crea orden, se reserva stock con stock_hold + expira_en)
  → comprobante_enviado   (SPEI: usuario sube comprobante; efectivo: agenda recoger)
  → pago_verificado       (vendor/admin concilia y aprueba)   ─┐
  → rechazado             (no coincide → vuelve a pendiente)   │
  → preparando → listo_entrega → entregado/cerrado            ─┘
  → expirado / cancelado  (libera el stock reservado)
```

**Flujo SPEI:**
1. Al confirmar, se muestra **CLABE del vendor + referencia única** (concepto = código de orden). Botón "copiar CLABE" y "copiar referencia".
2. El comprador transfiere desde su banco y **sube el comprobante** (foto/PDF).
3. Entra a la **cola de verificación** del vendor. Verifica monto + referencia contra su estado de cuenta y marca *verificado*.
4. Cronómetro (p. ej. 24–48 h): si no llega comprobante, expira y libera stock.

**Flujo efectivo:** se reserva, se paga en el **punto de entrega**, el cajero marca pagado y entregado en un solo paso.

**Anti-fraude (capas):**
- Referencia única por orden + match de monto exacto.
- Cola de verificación humana (doble check para montos altos).
- *(V2)* **OCR con Claude Vision**: lee monto, referencia y banco del comprobante y **auto-marca discrepancias** → acelera la verificación y reduce fraude.

**Decisión de flujo de dinero (a definir, recomiendo A):**
- **A — Directo al vendor (MVP):** cada tienda registra su CLABE; el dinero va directo; la plataforma **no custodia fondos** (cero carga regulatoria). La comisión universitaria se concilia aparte.
- **B — Cuenta central:** todo a una CLABE de la universidad y se dispersa a vendors periódicamente. Más control y captura de comisión, pero la plataforma retiene dinero (más responsabilidad/ops).

---

## 6. Comunidad cerrada + control por IP

- **Identidad:** SSO institucional (Entra/Google) restringido a dominios `@uni`; OTP por correo de respaldo. Nadie sin verificar compra.
- **Reglas de IP (`ip_rules`)** evaluadas en el **middleware** (lee `x-forwarded-for`, hace match CIDR):
  - `scope=global` → toda la tienda solo desde la red del campus (o bloquear rangos).
  - `scope=admin` → panel admin solo desde IP interna.
  - `scope=vendor` → ciertas acciones (confirmar entrega/efectivo) solo en sitio.
  - acción `allow|deny` + prioridad ⇒ listas blancas y negras combinables, editables desde el admin.
- **Cuidado UX:** un *gate* global deja fuera a quien compra desde casa. Recomiendo **IP obligatoria solo para acciones sensibles** (admin, efectivo) y el resto abierto a la comunidad verificada. Configurable.

---

## 7. La capa "no ordinaria": drops y comercio social

- **Drops:** lanzamientos agendados con **cuenta regresiva**, stock limitado y landing propia. Acceso justo (cola) al abrir. Stock en vivo vía SSE.
- **Preventas:** se vende antes de producir; "se produce si llegamos a N unidades" (umbral). Ideal para merch de clubes.
- **Listas de espera:** avisan cuando hay restock o nuevo drop (WhatsApp/correo).
- **Wishlist colaborativa:** listas que se comparten (ej. "kit de bienvenida de mi carrera").
- **Compras grupales por aula** ⭐ (lo más original):
  - Un **líder** abre una compra grupal para su grupo/aula con **meta de cantidad** y fecha límite.
  - Al alcanzar la meta se **desbloquea precio mayoreo / envío gratis**.
  - **Clave para pagos manuales:** se **recolectan comprobantes solo cuando se llega a la meta** (cada quien paga su parte por SPEI) → evita reembolsos, que son dolorosos sin pasarela.
- **Capa social:** seguir tiendas, calendario de drops, feed de novedades, notificaciones.

---

## 8. "Muy usable": principios de UX

- **Mobile-first** (los alumnos viven en el celular): pulgar-friendly, rápido (RSC).
- **Pago sin fricción:** instrucciones clarísimas, **copiar CLABE/referencia de un toque**, subir comprobante desde cámara/galería.
- **Timeline del pedido** estilo paquetería (pendiente → verificado → listo → entregado).
- **Avisos por WhatsApp + correo** en cada cambio de estado.
- **Descubrir rápido:** buscador, filtros por facultad/club, **calendario de drops**.
- **Panel de vendor simple:** productos, **cola de comprobantes por verificar**, stock, pedidos.
- **Accesible** (Radix), modo oscuro, **español primero**.

---

## 9. Roadmap por fases

**MVP (lo mínimo para vender):**
- SSO institucional + verificación de comunidad.
- Middleware de IP (gate por acción).
- CRUD de vendors y productos/variantes + stock con reservas.
- Carrito + orden + **pago SPEI con comprobante** + **efectivo** + cola de verificación.
- Timeline de pedido + notificaciones (correo).
- Panel de vendor básico.

**V1 (lo que lo vuelve especial):**
- **Drops** con cuenta regresiva + stock en vivo + **listas de espera**.
- **Preventas** con umbral.
- WhatsApp en avisos.
- Ratings/reseñas de vendors. Dashboards y conciliación.

**V2 (diferenciación fuerte):**
- **Compras grupales por aula** + **wishlist colaborativa**.
- **OCR de comprobantes con Claude** (verificación asistida).
- Gamificación ligera (insignias por compras/drops), analítica, recomendaciones.

---

## 10. Decisiones cerradas (2026-06-19)

| Tema | Decisión |
|---|---|
| **Flujo de dinero** | ✅ **Directo a la CLABE de cada vendor.** La plataforma no custodia fondos; la comisión universitaria se concilia aparte. |
| **Proveedor SSO** | ✅ **Auth.js v5 + Google OAuth (gratis)** restringido a dominios institucionales, con **OTP por correo (magic link)** de respaldo. Ambos sin costo. |
| **Control por IP** | ✅ **Gate global de toda la tienda** (solo se entra desde la red/WiFi escolar) pero **activable/desactivable** por feature flag (`IP_GATE_ENABLED`) desde el admin. |
| **Entrega** | ✅ **Aula o punto de entrega; por defecto el aula del vendedor.** Encaja con compras grupales por aula. |
| Hosting | Self-host/VPS recomendado: el gate global por IP necesita ver la IP real del cliente (configurar `trust proxy` / `x-forwarded-for`). |
| Reembolsos | Minimizarlos por diseño (en grupales se cobra tras alcanzar la meta; reservar-luego-pagar). |

> Pendientes menores a confirmar: rangos **CIDR** exactos del campus, lista de **dominios `@uni`** permitidos, y si admin/efectivo exige IP interna aun con el gate global apagado.

---

## 11. Próximos pasos sugeridos

1. Confirmar las 4 decisiones de §10 (sobre todo SSO, flujo de dinero y modelo de entrega).
2. Cerrar el **modelo de datos** y máquina de estados del pedido.
3. Hacer un **prototipo navegable** (Figma o directamente shadcn) de: catálogo → producto → checkout SPEI → subir comprobante → timeline.
4. Scaffolding del proyecto (Next.js + Drizzle + Auth.js + shadcn) y la primera vertical: **vendor → producto → orden → pago verificado**.
