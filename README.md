# Ágora Campus — UPY Ecommerce

> Plataforma de **marketplace interno** para la comunidad de la **Universidad Politécnica de Yucatán (UPY)**.
> Proyecto #06 — *Platform Design & GitHub Repository* (Unidad 2).

**Ágora Campus** es un espacio de comercio **cerrado a la comunidad universitaria**, donde facultades, clubes y emprendimientos de alumnos venden bajo una sola tienda. Sus tres rasgos distintivos:

- 🔒 **Comunidad cerrada** — acceso con correo institucional (Google `@upy`) y *gate* global por IP **activable** (solo la red/WiFi del campus).
- 💸 **Pagos manuales sin pasarela** — efectivo o transferencia **SPEI** con **comprobante** verificado a mano; el dinero va **directo a la CLABE de cada vendedor** (la plataforma no custodia fondos).
- 🔥 **Comercio social / Drops** — lanzamientos por tiempo limitado, preventas, listas de espera y **compras grupales por aula**. Entrega **a aula o punto** (por defecto, el aula del vendedor).

---

## 📌 Tabla de contenido
1. [Stack tecnológico](#-stack-tecnológico)
2. [Estructura del repositorio](#-estructura-del-repositorio)
3. [Infraestructura de datos](#-infraestructura-de-datos)
4. [Cómo ejecutarlo localmente](#-cómo-ejecutarlo-localmente)
5. [Scripts disponibles](#-scripts-disponibles)
6. [Variables de entorno](#-variables-de-entorno)
7. [Despliegue](#-despliegue)
8. [Documentación](#-documentación)
9. [Equipo y roles](#-equipo-y-roles)

---

## 🧱 Stack tecnológico

| Capa | Tecnología |
| --- | --- |
| Framework | **Next.js** (App Router, RSC) + **TypeScript** |
| Base de datos | **PostgreSQL** + **Drizzle ORM** (`drizzle-zod`) |
| UI | **TailwindCSS** + **shadcn/ui** (Radix) |
| Validación | **Zod** |
| Autenticación | **Auth.js v5** (Google OAuth, gratuito) + OTP por correo |
| Trabajos en segundo plano | **pg-boss** (sobre el mismo PostgreSQL) |
| Datos de muestra | **Node** + **SheetJS (`xlsx`)** |

Todo el código de la aplicación vive bajo `src/`.

---

## 📂 Estructura del repositorio

```
UPY-Ecommerce/
├── data/
│   └── samples/              # 🔢 Datos de muestra generados (CSV · JSON · Excel)
│       ├── csv/              #    8 archivos .csv (uno por entidad)
│       ├── json/             #    .json por entidad + agora-sample-data.json combinado
│       └── excel/            #    agora-sample-data.xlsx (una hoja por entidad)
├── docs/                     # 📚 Documentación
│   ├── ERD.md                #    Diagrama entidad–relación (Mermaid) + máquinas de estado
│   ├── ARQUITECTURA.md       #    Arquitectura del sistema
│   ├── DICCIONARIO_DE_DATOS.md
│   └── DOCUMENTACION_GLOBAL.md
├── scripts/
│   └── generate-sample-data.mjs   # 🛠️ Script generador de datos de muestra
├── src/
│   ├── app/                  # Rutas (App Router)
│   │   ├── (store)/          #    Tienda: catálogo, producto, drops, carrito, checkout
│   │   ├── (account)/        #    Cuenta: pedidos + timeline de estados
│   │   ├── vendor/           #    Panel del vendedor (productos, pedidos, comprobantes, drops)
│   │   ├── admin/            #    Panel de universidad (vendedores, reglas de IP, config)
│   │   ├── auth/             #    Inicio de sesión
│   │   └── api/              #    🌐 Estructura de la API (route handlers)
│   ├── components/           # Componentes UI + de dominio
│   ├── db/                   # 🗄️ Cliente Drizzle + esquema
│   │   ├── index.ts
│   │   └── schema/           #    Esquema dividido por dominio (users, vendors, products, …)
│   ├── lib/                  # auth · ip-rules · payments/state-machine · notifications
│   ├── server/jobs/          # Trabajos pg-boss
│   └── middleware.ts         # 🛡️ Gate global por IP (activable por feature flag)
├── .env.example
├── drizzle.config.ts
├── PLAN.md                   # Plan general (decisiones de diseño)
└── README.md
```

---

## 🔢 Infraestructura de datos

Este es el corazón del entregable. Se compone de cuatro piezas:

### 1. Esquema de base de datos (`src/db/schema/`)
Esquema relacional en **Drizzle ORM** dividido por dominio: `users`, `vendors`, `products`, `orders`, `payments`, `drops`, `social`, `ip-rules`. Modela **22 tablas** con sus llaves foráneas, *enums* (estados de pedido/pago, tipos de vendedor) y relaciones. Ver el **[ERD completo](./docs/ERD.md)**.

### 2. Estructura de la API (`src/app/api/`)
*Route handlers* de Next.js que definen los endpoints de la plataforma:

| Endpoint | Métodos | Propósito |
| --- | --- | --- |
| `/api/auth/[...nextauth]` | GET·POST | Autenticación (Auth.js) |
| `/api/orders` · `/api/orders/[id]` | GET·POST·PATCH | Pedidos y máquina de estados |
| `/api/payments/comprobante` | POST | Subida del comprobante SPEI |
| `/api/payments/[id]/verificar` | POST | Verificación de pago por el vendedor |
| `/api/drops` | GET·POST | Drops y lanzamientos |
| `/api/group-buys` | GET·POST | Compras grupales por aula |
| `/api/ip-check` | GET | Validación de IP del campus |

### 3. Script de generación de datos (`scripts/generate-sample-data.mjs`)
Generador **determinista** (semilla fija → dataset reproducible) que crea registros coherentes con el esquema y los exporta en los tres formatos. Se ejecuta con:

```bash
npm run data:generate
```

### 4. Archivos de datos de muestra (`data/samples/`)
Salida del generador, lista para inspección o carga inicial:

| Formato | Ubicación | Contenido |
| --- | --- | --- |
| **CSV** | `data/samples/csv/` | 8 archivos (1 por entidad) |
| **JSON** | `data/samples/json/` | 1 por entidad + `agora-sample-data.json` combinado |
| **Excel** | `data/samples/excel/agora-sample-data.xlsx` | Libro con una hoja por entidad |

Volúmenes aproximados: 60 usuarios · 8 vendedores · 37 productos · 72 variantes · 50 pedidos · 99 ítems · 50 pagos.

---

## ▶️ Cómo ejecutarlo localmente

**Requisitos:** Node.js 20+, PostgreSQL 15+ y npm.

```bash
# 1. Clonar e instalar dependencias
git clone https://github.com/DaniWin02/UPY-Ecommerce.git
cd UPY-Ecommerce
npm install

# 2. Configurar variables de entorno
cp .env.example .env.local        # luego edita .env.local

# 3. Generar los datos de muestra (CSV · JSON · Excel)
npm run data:generate

# 4. Levantar el servidor de desarrollo
npm run dev                       # http://localhost:3000
```

> 💡 El **skeleton arranca sin base de datos**: las páginas y la estructura de API responden de inmediato. PostgreSQL solo es necesario para aplicar migraciones y persistir datos reales (`npm run db:generate && npm run db:migrate`).

---

## 📜 Scripts disponibles

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` | Build de producción. |
| `npm run start` | Sirve la build de producción. |
| `npm run lint` | Linter (ESLint / Next). |
| `npm run db:generate` | Genera migraciones de Drizzle desde el esquema. |
| `npm run db:migrate` | Aplica las migraciones a PostgreSQL. |
| `npm run db:studio` | Explorador visual de la base de datos. |
| `npm run data:generate` | **Genera los datos de muestra (CSV · JSON · Excel).** |

---

## 🔐 Variables de entorno

Definidas en `.env.example`. Las principales:

| Variable | Descripción |
| --- | --- |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL. |
| `AUTH_SECRET` | Secreto de Auth.js. |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Credenciales de Google OAuth. |
| `ALLOWED_EMAIL_DOMAINS` | Dominios institucionales permitidos (p. ej. `alumno.upy.edu.mx`). |
| `IP_GATE_ENABLED` | Activa/desactiva el *gate* global por IP. |
| `CAMPUS_CIDRS` | Rangos CIDR de la red del campus. |

---

## 🚀 Despliegue

El repositorio entrega un **skeleton listo para desplegar**. El despliegue lo realiza el profesor vía **GitHub Actions** tras revisar y aprobar el cumplimiento de los requisitos mínimos (esquema, API, scripts de datos y archivos de muestra).

---

## 📚 Documentación

- [PLAN.md](./PLAN.md) — Plan general y decisiones de diseño.
- [docs/ERD.md](./docs/ERD.md) — Diagrama entidad–relación + máquinas de estado.
- [docs/ARQUITECTURA.md](./docs/ARQUITECTURA.md) — Arquitectura del sistema.
- [docs/DICCIONARIO_DE_DATOS.md](./docs/DICCIONARIO_DE_DATOS.md) — Diccionario de datos.
- [docs/DOCUMENTACION_GLOBAL.md](./docs/DOCUMENTACION_GLOBAL.md) — Documentación global.

---

## 👥 Equipo y roles

> ⚠️ **Por completar:** sustituyan los nombres y handles reales. **Cada integrante debe tener al menos un commit** en el repositorio (los repos con un solo contribuidor no se aceptan).

| Integrante | GitHub | Rol principal |
| --- | --- | --- |
| _Daniel_ (por confirmar) | [@DaniWin02](https://github.com/DaniWin02) | Coordinación del repositorio · Estructura de la API |
| Raúl Cetina Pool | _@por-confirmar_ | Infraestructura de datos · Generador y datos de muestra |
| _Integrante 3_ | _@por-confirmar_ | Esquema de base de datos · Diccionario de datos |
| _Integrante 4_ | _@por-confirmar_ | Frontend / UI · Documentación |

---

<sub>Universidad Politécnica de Yucatán · Proyecto #06 — Unidad 2</sub>
