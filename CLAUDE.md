# Delycia POS — guía para continuar

POS web de **Delycia** (restaurante, Santa Cruz de la Sierra, Bolivia). Ventas + cocina (KDS) en tiempo real,
cobro, cuentas por cobrar, historial, apertura/cierre de caja. Dueño: Yasser (habla español; respuestas
concisas; no inventar precios ni cifras: preguntar).

Lee también: `AGENTS.md` (reglas de Next 16), `docs/estado-actual.md` (pendientes y bugs), `docs/infra.md` (AWS).

## Stack

| Capa | Versión / elección |
|---|---|
| App | Next.js **16.4** (App Router, `output: "standalone"`, `cacheComponents: false`), React 19, TypeScript |
| DB | PostgreSQL 16 + **Prisma 7.10** (`prisma-client` generator → `src/generated/prisma`, adapter `@prisma/adapter-pg`) |
| UI | Tailwind 4 + componentes estilo shadcn escritos a mano en `src/components/ui` (el registry de shadcn estaba bloqueado) |
| Validación | Zod 4 |
| Auth | Cookie JWT HS256 (`jose`) + PIN de 4 dígitos (bcrypt) |
| Tiempo real | SSE (`/api/realtime`) + hub en memoria |
| PDF | `pdf-lib` (cierre de caja) |
| Tests | Vitest 4 (unitarios + integración contra Postgres real) |
| Infra local | Docker multi-stage + docker-compose (db, migrate, app) |

> Next 16 trae cambios grandes (ej. `middleware` → `proxy.ts`, `PageProps`/`LayoutProps`/`RouteContext` globales,
> `refresh()`). Antes de escribir código de Next, consulta `node_modules/next/dist/docs/`.

## Estructura

```
src/
├─ app/                  rutas (solo composición): (caja)/pos|ordenes|cuentas-por-cobrar|historial|cierre|catalogo|ajustes,
│                        cocina/, login/, imprimir/{ticket,comanda,cierre}, api/{realtime,cocina/comandas,reportes/cierre,health}
├─ config/               raíz de composición: modules.ts (módulos activos), bootstrap.ts (suscriptores + SSE)
├─ core/                 núcleo compartido (NO importa módulos): money, events (bus), db (cliente lazy + runInTransaction),
│                        auth (permisos, sesión, PIN), settings, time (día de negocio La Paz), realtime (hub SSE), actions
├─ modules/
│  ├─ catalog/           categorías, productos, modificadores, "modificador a toda la categoría", getSellableCatalog()
│  ├─ sales/             órdenes, precios por canal (PEYA), cobro, fiado, historial, apertura/cierre, reportes PDF/CSV
│  └─ kitchen/           comandas (KDS), estados, mensajes caja→cocina
├─ components/ui|shell|print
├─ lib/                  use-live-events (SSE + vigilante), sound (Web Audio), utils
├─ instrumentation.ts    llama bootstrap() al arrancar
└─ proxy.ts              sesión + permisos por ruta
prisma/  schema.prisma, migrations/ (10), seed.ts + seed-data.ts, data/menu-delycia.json
tests/   core, catalog, sales, kitchen, integration, support (db reset, catálogo fijo de tests)
```

## Decisiones de arquitectura (no romper)

- **Monolito modular.** Fuera de un módulo solo se importa `@/modules/<x>` (su `index.ts`). ESLint lo bloquea
  (`no-restricted-imports`); `core` no puede importar módulos ni `config`.
- **Eventos de dominio** (`core/events/bus.ts`) en dos fases: `onTransaction` (misma transacción, todo o nada;
  el handler recibe `tx` y `publish`) y `onAfterCommit` (SSE). Todo evento se guarda en `DomainEvent` (outbox).
  Ventas emite `order.*`; Cocina crea la comanda escuchando `order.sent_to_kitchen`; Ventas cierra la orden
  escuchando `ticket.status_changed`. Suscriptores se registran en `module.ts` → `config/bootstrap.ts`.
- **Tiempo real:** las pantallas piden el estado completo al (re)conectar y ante cada evento; no dependen de
  recibir cada evento. Latido SSE 15 s; el cliente reconecta si pasan 35 s sin datos. Hub en memoria =
  **una sola instancia** de la app.
- **Dinero en centavos (Int)**. `formatMoney`/`parseMoney`/`formatMoneyInput` en `core/money`.
- **Snapshots:** `OrderItem` copia nombre, precio y modificadores; cambiar el catálogo no altera ventas.
- **Nada se borra** en ventas (estados + motivo). Productos se desactivan.
- **Día de negocio** = fecha en `America/La_Paz` (`core/time`); numeración de órdenes diaria (`DailyCounter`).
- **Permisos** en un solo mapa (`core/auth/permissions.ts`): de ahí salen menú, `proxy.ts` y `requirePermission()`.
- **Menú:** se carga una vez desde `prisma/data/menu-delycia.json`; cambios posteriores = `MENU_UPDATES`
  versionados en `prisma/seed-data.ts` (setting `seed.menuVersion`, hoy v2).
- Server Actions devuelven `ActionResult` vía `toActionResult()` (errores en español; `DomainError` para negocio).

## Reglas de negocio clave

- Estados orden: `OPEN` ("Por pagar") → `PAID` → `CLOSED` (automático cuando no quedan comandas abiertas) / `CANCELLED`.
  Una orden pagada no se modifica. "Por pagar" puede ir a cocina.
- Comanda: `PENDING → IN_PROGRESS → READY` (**READY = entregada**, pasa a "Recientes"); deshacer vuelve un paso.
- Canal **PEYA**: precio = (lista + modificadores) × (1 + %) redondeado al Bs entero; % global en Ajustes (seed 40);
  la orden guarda su %; **orden PEYA se cobra solo con PEYA** y PEYA no existe en órdenes del local.
- Pagos: EFECTIVO (vuelto), QR, TARJETA, PEYA, CUENTA POR COBRAR (exige nombre; abonos en `CreditCollection`). Pago mixto.
- Apertura de caja obligatoria antes de vender; **una por día, no editable**. Cierre: arqueo efectivo/QR/tarjeta.

## Correr en local

```powershell
Copy-Item .env.example .env
npm install            # .npmrc usa legacy-peer-deps (bug de npm 10.9 con peers de vitest)
docker compose up -d db
npm run db:migrate     # migrate dev + prisma generate
npm run db:seed
npm run dev            # http://localhost:3000  — Admin 1234 · Caja 1111 · Cocina 2222 (PIN de desarrollo)
```
Todo en Docker: `docker compose up --build -d` (db → migrate+seed → app). `down -v` borra la base.

## Variables de entorno (ver `.env.example`)

`DATABASE_URL`, `TEST_DATABASE_URL`, `POSTGRES_PASSWORD` (compose), `SESSION_SECRET` (≥16 caracteres),
`COOKIE_SECURE` (`true` solo con HTTPS). Docker inyecta `NODE_ENV`, `PORT`, `HOSTNAME`.

## Comandos

| Comando | Para qué |
|---|---|
| `npm test` | Vitest (usa `delycia_test`; requiere el Postgres de compose) |
| `npm run lint` / `npm run typecheck` | ESLint (incluye fronteras de módulos) / `next typegen && tsc` |
| `npm run db:migrate -- --name x` | Nueva migración (en entorno no interactivo: `npx prisma migrate dev --name x < /dev/null`) |
| `npm run build` | Build de producción (standalone) |

## Notas para el agente

- Prisma bloquea `migrate reset` lanzado por un agente: no forzarlo; usar `resetDatabase()` en tests.
- `migrate dev` en Prisma 7 no regenera el cliente: `npx prisma generate` (el script `db:migrate` ya lo hace).
- Commits pequeños en español (`feat(...)`, `fix(...)`), push a `main` de `ytalamas18/delycia-pos` (público).
- Verificar en navegador con Playwright (`/opt/pw-browsers/chromium`) además de los tests.
