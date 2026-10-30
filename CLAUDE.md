# Delycia POS — guía para continuar

POS web de **Delycia** (restaurante, Santa Cruz de la Sierra, Bolivia). Ventas + cocina (KDS) en tiempo real,
cobro, cuentas por cobrar, historial, apertura/cierre de caja, catálogo con tipos de ítem y recetas, compras con
crédito y abonos, inventario (kárdex), reportes y usuarios con roles y permisos. Dueño: Yasser (habla español;
respuestas concisas; no inventar precios ni cifras: preguntar).

Lee también: `AGENTS.md` (reglas de Next 16), `docs/estado-actual.md` (pendientes y bugs), `docs/infra.md` (AWS),
`docs/spec-compras-inventario.md` (spec y decisiones de compras/inventario/recetas).

## Stack

| Capa | Versión / elección |
|---|---|
| App | Next.js **16.4** (App Router, `output: "standalone"`, `cacheComponents: false`), React 19, TypeScript |
| DB | PostgreSQL 16 + **Prisma 7.10** (`prisma-client` generator → `src/generated/prisma`, adapter `@prisma/adapter-pg`) |
| UI | Tailwind 4 + componentes estilo shadcn escritos a mano en `src/components/ui` (el registry de shadcn estaba bloqueado) |
| Validación | Zod 4 |
| Auth | Usuario + PIN de 4 dígitos (bcrypt); cookie JWT HS256 (`jose`) con solo id + versión de sesión |
| Tiempo real | SSE (`/api/realtime`) + hub en memoria |
| PDF / Excel | `pdf-lib` (cierre y exportes A4) + `exceljs` (exportes .xlsx), vía `core/export` |
| Tests | Vitest 4 (unitarios + integración contra Postgres real) |
| Infra local | Docker multi-stage + docker-compose (db, migrate, app) |

> Next 16 trae cambios grandes (ej. `middleware` → `proxy.ts`, `PageProps`/`LayoutProps`/`RouteContext` globales,
> `refresh()`). Antes de escribir código de Next, consulta `node_modules/next/dist/docs/`.

## Estructura

```
src/
├─ app/                  rutas (solo composición): (caja)/pos|ordenes|cuentas-por-cobrar|historial|cierre|reportes|catalogo|compras|inventario|usuarios|ajustes|sin-acceso,
│                        cocina/, login/, imprimir/{ticket,comanda,cierre}, api/{realtime,cocina/comandas,reportes/cierre,exportar/[reporte],plantilla-items,health}
├─ config/               raíz de composición: modules.ts (módulos activos), bootstrap.ts (suscriptores + SSE)
├─ core/                 núcleo compartido (NO importa módulos): money, events (bus), db (cliente lazy + runInTransaction),
│                        auth (permisos, sesión, PIN), settings, time (día de negocio La Paz), realtime (hub SSE), actions,
│                        export (ExportDocument → Excel/PDF reutilizable), quantity (Decimal para cantidades),
│                        hooks/product-guards (validaciones de otros módulos antes de cambiar un ítem)
├─ modules/
│  ├─ catalog/           ítems (tipo Normal/Preparado/Ingrediente/Insumo, unidad base, presentaciones, stock mínimo,
│  │                     último costo), recetas (+ condición para llevar, de modificadores), costo y margen,
│  │                     carga rápida (Excel/CSV), getSellableCatalog() (solo Normal y Preparado)
│  ├─ sales/             órdenes, precios por canal (PEYA), cobro, fiado, historial, apertura/cierre, reportes PDF/CSV
│  ├─ kitchen/           comandas (KDS), estados, mensajes caja→cocina, avisos de anulación
│  ├─ purchases/         proveedores, compras (contado/crédito/parcial), abonos, cuentas por pagar
│  ├─ inventory/         kárdex (StockMovement), descuento por ventas/compras por eventos, ingreso, conteo, salida rápida
│  ├─ users/             administración de usuarios y roles (las tablas User/Role son del núcleo: core/auth las lee)
│  └─ reports/           SOLO LECTURA: ventas por canal (+ dinero cobrado), productos, anulaciones, cuentas por cobrar,
│                        stock, stock bajo, kárdex, mermas, compras, cuentas por pagar
├─ components/ui|shell|print
├─ lib/                  use-live-events (SSE + vigilante), sound (Web Audio), theme (claro/oscuro), utils
├─ instrumentation.ts    llama bootstrap() al arrancar
└─ proxy.ts              sesión + permisos por ruta
prisma/  schema.prisma, migrations/ (18), seed.ts + seed-data.ts, data/menu-delycia.json
tests/   core, catalog, sales, kitchen, purchases, inventory, reports, integration, support (db reset, catálogo fijo, createTestUser)
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
- **Reportes** (`modules/reports`) es la única excepción a "cada módulo lee solo sus tablas": lee Ventas y
  Catálogo con SQL agregado (`$queryRaw` + GROUP BY), **nunca escribe** y no escucha eventos. Filtra por
  `Order.businessDate` (ya en hora de La Paz). Montos = snapshot de la orden. Solo PAGADA/CERRADA suman; anuladas aparte.
  Canal = medio de pago; un medio nuevo aparece solo (`CHANNEL_ORDER` solo fija el orden).
  **Venta ≠ dinero:** lo fiado es venta del día; el dinero entra cuando se abona (por fecha del abono).
  "Dinero cobrado" (`getMoneyIn`) cuadra con `moneyInByMethod` del cierre. Anulaciones se filtran por la hora
  de la anulación; fiados, por el día de la orden. Clientes y motivos se agrupan con `textKey()`.
- **Exportar:** cada reporte arma un `ExportDocument` (columnas tipadas: text/int/money/date/datetime/percent)
  y `core/export` genera Excel (valores reales, hora La Paz) y PDF A4. Se descarga por
  `/api/exportar/<clave>?formato=xlsx|pdf&<mismos filtros que la pantalla>`; las claves y permisos están en
  `app/api/exportar/[reporte]/route.ts` (+ `reportExports` del módulo Reportes). Botones: `components/shell/export-buttons`.
- **Ítems y cantidades:** el "ítem" es `Product` con `type`, `baseUnit`, `tracksStock`, `minStock`, `lastCostCents`.
  Cantidades `Decimal(12,3)` (`core/quantity`); costo unitario `Decimal(14,4)` en centavos; totales `Int`.
  Kg↔g y litro↔ml se convierten (`toBaseQuantity`); presentaciones con factor. Los componentes cliente NO deben
  importar archivos que usen `Decimal` (traen el cliente Prisma): usar `unit-labels.ts`, `recipe-conditions.ts`, etc.
- **Inventario por eventos:** stock = suma de `StockMovement` (nunca se edita). Inventario escucha
  `purchase.registered/cancelled`, `order.sent_to_kitchen`/`order.paid` (descuenta con el primero, idempotente por
  `orderItemId`; PEYA = para llevar), `order.item_voided`/`order.cancelled` (revierte) y `catalog.items_imported`
  (inventario inicial). Ventas solo publica (sus eventos llevan `productId` e ítems). Stock negativo permitido.
- **Compras:** el gasto es el total en la fecha de compra; el dinero sale en la fecha de cada pago. Pagos a
  proveedores en efectivo restan del efectivo esperado del cierre ("Pagos a proveedores"; Ventas llama a
  `supplierPaymentsForDay`). Anular compra exige anular antes sus pagos.
- **Tema claro/oscuro** por dispositivo y por pantalla (`localStorage` `delycia.theme.pos|cocina`; POS claro,
  Cocina oscuro por defecto). `themeBootScript` en `app/layout.tsx` lo aplica antes de pintar; usar siempre
  variantes `dark:` en colores fijos (ej. `text-red-700 dark:text-red-400`). `/imprimir` siempre en claro.
- **Usuarios y roles:** un usuario (nombre completo, `username` único en minúsculas, PIN bcrypt, activo) tiene un
  solo rol; el rol guarda nombre + claves de permisos (tabla `AccessRole`, modelo `Role`). Roles de sistema
  (`systemKey`): **Admin** (todos los permisos, calculados en código; no se desactiva ni pierde permisos, sí se
  renombra), **Caja** y **Cocina** (editables). Nada se borra: usuarios y roles se desactivan. Siempre queda un
  Admin activo; nadie se desactiva ni se quita el Admin a sí mismo; solo un Admin da el rol Admin, edita a otro
  Admin o le resetea el PIN; nadie da permisos que su rol no tiene. La columna `User.role` (enum `LegacyRole`)
  queda sin uso para poder volver atrás; se borra en una migración futura.
- **Permisos** en un solo catálogo (`core/auth/permissions.ts`: clave, pantalla, etiqueta y descripción en
  español). De ahí salen el editor de roles, el menú, `proxy.ts` y `requirePermission()` (acepta una lista =
  basta uno); `can(session, permiso)` en el resto. **Módulo nuevo:** declara sus permisos en `PERMISSIONS`
  (`<módulo>.<acción>`) y, si tiene pantallas, su ruta en `routePermissions`: aparecen solos en el editor de
  roles y el Admin los recibe sin migración. Para darlos por defecto a Caja/Cocina en bases existentes hace falta
  una migración que los agregue a esos roles (los roles ya creados no se tocan desde el seed).
- **Sesión:** la cookie solo guarda `userId` + `sessionVersion`; `loadSessionUser()` lee usuario y rol en cada
  request (proxy en runtime Node y `getSession()` con `cache()`). Desactivar, cambiar el rol o los permisos aplica
  al instante; resetear el PIN sube `sessionVersion` y cierra las sesiones abiertas.
- **Menú:** se carga una vez desde `prisma/data/menu-delycia.json`; cambios posteriores = `MENU_UPDATES`
  versionados en `prisma/seed-data.ts` (setting `seed.menuVersion`, hoy v3).
- Server Actions devuelven `ActionResult` vía `toActionResult()` (errores en español; `DomainError` para negocio).

## Reglas de negocio clave

- Estados orden: `OPEN` ("Por pagar") → `PAID` → `CLOSED` (automático cuando no quedan comandas abiertas) / `CANCELLED`.
  Una orden pagada no se modifica. "Por pagar" puede ir a cocina.
- Comanda: `PENDING → IN_PROGRESS → READY` (**READY = entregada**, pasa a "Recientes"); deshacer vuelve un paso.
- Canal **PEYA**: precio = (lista + modificadores) × (1 + %) redondeado al Bs entero; % global en Ajustes (seed 40);
  la orden guarda su %; **orden PEYA se cobra solo con PEYA** y PEYA no existe en órdenes del local.
- **Login:** usuario + PIN. Error siempre genérico ("Usuario o PIN incorrecto."), no dice si el usuario existe ni
  si está bloqueado (con usuario inexistente igual se compara un hash). 5 fallos seguidos → bloqueo 15 min por
  usuario. El último usuario se recuerda en el aparato (`localStorage` `delycia.login.username`).
- **PIN:** nunca en el repo (ni README ni docs). Seed: usuarios `admin`/`caja`/`cocina` con `ADMIN_PIN`/`CAJA_PIN`/
  `COCINA_PIN` o aleatorios impresos una vez. Reseteo en Usuarios (`users.manage` + PIN propio; rechaza PIN débiles).
- Pagos: EFECTIVO (vuelto), QR, TARJETA, PEYA, CUENTA POR COBRAR (exige nombre; abonos en `CreditCollection`). Pago mixto.
- **Anulaciones** (`sales/services/voids.ts`): ítem (solo orden por pagar) u orden completa, motivo obligatorio;
  guarda quién anuló y quién autorizó. Quien tiene `sales.void.authorize` anula directo; con solo `sales.void`
  hay que escribir **usuario y PIN** de alguien con `sales.void.authorize` (`authorizeAction`, mismo bloqueo). Orden cobrada:
  solo el mismo día de negocio, pagos → `refundedAt`. Fiado con abonos: no se anula. Eventos `order.item_voided` /
  `order.cancelled` → Cocina marca ANULADO y deja la comanda con aviso (`voidAlertAt`) hasta "Entendido".
- Permisos por defecto: **Caja** = POS, cobrar, descuento, anular (con autorización), historial, cuentas por
  cobrar, mensajes a cocina, apertura/cierre, ver Cocina y salida rápida. **Cocina** = ver y atender Cocina.
  Reportes, Ajustes, Catálogo, Compras, Inventario (ver/ingreso/conteo) y Usuarios: solo Admin por defecto.
  En ventas, la UI esconde Cobrar / descuento / Anular según el rol (`salesAbilities()`), y las actions lo validan.
- Apertura de caja obligatoria antes de vender; **una por día, no editable**. Cierre: arqueo efectivo/QR/tarjeta.

## Correr en local

```powershell
Copy-Item .env.example .env
npm install            # .npmrc usa legacy-peer-deps (bug de npm 10.9 con peers de vitest)
docker compose up -d db
npm run db:migrate     # migrate dev + prisma generate
npm run db:seed
npm run dev            # http://localhost:3000  — usuario admin/caja/cocina; PIN: *_PIN del .env o los que imprime el seed
```
Todo en Docker: `docker compose up --build -d` (db → migrate+seed → app). `down -v` borra la base.

## Variables de entorno (ver `.env.example`)

`DATABASE_URL`, `TEST_DATABASE_URL`, `POSTGRES_PASSWORD` (compose), `SESSION_SECRET` (≥16 caracteres),
`COOKIE_SECURE` (`true` solo con HTTPS),
`ADMIN_PIN`/`CAJA_PIN`/`COCINA_PIN` (opcionales, solo al crear los usuarios). Docker inyecta `NODE_ENV`, `PORT`, `HOSTNAME`.

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
- Tests que crean usuarios sin correr el seed: `createTestUser(db, { systemRole })` (`tests/support/users.ts`).
- Verificar en navegador con Playwright (`/opt/pw-browsers/chromium`) además de los tests.
