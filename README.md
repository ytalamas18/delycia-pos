# Delycia POS

Punto de venta web para **Delycia** (restaurante casual boliviano, Santa Cruz de la Sierra).
Fase 1: **Ventas + Cocina (KDS)** en tiempo real, con la arquitectura preparada para sumar
reportería, inventario, costos/recetas, clientes y roles sin reescribir lo existente.

> Estado: **paso 1 de 7, setup y estructura**. Ver [Hoja de ruta](#hoja-de-ruta).

---

## Stack y por qué

| Capa | Elección | Por qué |
|---|---|---|
| App | Next.js 16 (App Router) + TypeScript | Front y back en un solo despliegue: ideal para un monolito de un local. |
| Base de datos | PostgreSQL 16 + Prisma 7 | Transacciones reales (enviar a cocina o cobrar nunca queda a medias) y migraciones versionadas. |
| UI | Tailwind CSS 4 + componentes estilo shadcn/ui | Componentes accesibles, fáciles de agrandar para pantallas táctiles. |
| Validación | Zod | Un mismo esquema valida formularios y servicios. |
| Tiempo real | Server-Sent Events (SSE) | El servidor solo necesita *empujar* a las pantallas; el navegador reconecta solo. |
| Tests | Vitest | Rápido y compatible con TypeScript sin configuración extra. |
| Infra local | Docker + docker-compose | Un comando levanta base de datos, migraciones y app. |

**Dinero:** siempre enteros en centavos (`src/core/money`). Nunca `float`.

## Arquitectura: monolito modular

```
src/
├─ app/            # Rutas (Next.js). Solo composición: sin lógica de negocio.
├─ config/         # Raíz de composición: qué módulos están activos.
├─ core/           # Núcleo compartido: dinero, eventos, registro de módulos, config.
├─ modules/
│  ├─ catalog/     # Categorías, productos, modificadores
│  ├─ sales/       # Órdenes, carrito, cobro, anulaciones
│  └─ kitchen/     # Comandas y pantalla de cocina (KDS)
├─ components/     # UI compartida (ui/ = componentes base, shell/ = menú y layout)
└─ lib/
```

Reglas (las vigila ESLint, no solo la disciplina):

1. **Un módulo solo se importa por su API pública**: `@/modules/sales`, nunca `@/modules/sales/services/...`.
2. **`core` no depende de ningún módulo.**
3. **Los módulos se hablan por eventos de dominio.** Ventas emite `order.sent_to_kitchen`;
   Cocina lo escucha y crea la comanda. Cocina emite `ticket.ready`; Ventas avisa al cajero.

```
          order.sent_to_kitchen / order.item_voided / order.cancelled
  Ventas ─────────────────────────────────────────────────────────▶ Cocina
         ◀─────────────────────────────────────────────────────────
                         ticket.ready / ticket.status_changed
```

**Bus de eventos en dos fases** (`src/core/events/bus.ts`):

- `transaction`: el handler corre dentro de la misma transacción de base de datos. Si algo falla,
  se revierte todo. Así nunca queda "ítem enviado a cocina" sin su comanda.
- `afterCommit`: corre después de confirmar. Lo usa el empuje por SSE a las pantallas.

Cada evento se guarda en una tabla (`DomainEvent`) con id secuencial. Cuando una pantalla se
reconecta, pide lo que se perdió desde su último id: **no se pierde ninguna comanda**.

**Registro de módulos** (`src/config/modules.ts`): cada módulo declara su nombre, su menú y sus
suscriptores. Si pones `enabled: false`, desaparece del menú, sus rutas devuelven 404 y sus
eventos dejan de escucharse.

---

## Correr en local con Docker (recomendado)

Requisitos: [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```powershell
git clone https://github.com/<tu-usuario>/delycia-pos.git
cd delycia-pos
docker compose up --build
```

Esto levanta:

| Servicio | Qué hace |
|---|---|
| `db` | PostgreSQL 16 (puerto 5432). Crea también la base `delycia_test` para tests. |
| `migrate` | Corre una vez: aplica migraciones y carga los datos de ejemplo. |
| `app` | La aplicación en **http://localhost:3000** |

Para apagar: `docker compose down` (los datos se conservan en el volumen `pgdata`).
Para borrar también los datos: `docker compose down -v`.

## Correr en modo desarrollo (con recarga en caliente)

Requisitos: Node.js 22 y Docker (solo para la base de datos).

```powershell
Copy-Item .env.example .env      # en Linux/macOS: cp .env.example .env
npm install
docker compose up -d db          # solo la base de datos
npm run db:migrate               # aplica migraciones
npm run db:seed                  # datos de ejemplo
npm run dev                      # http://localhost:3000
```

## Abrir la pantalla de cocina desde otro dispositivo (tablet/TV)

La tablet de cocina y la PC que corre el POS deben estar en **la misma red WiFi**.

1. Averigua la IP local de la PC:
   - Windows: `ipconfig` → "Dirección IPv4" (ej. `192.168.1.50`)
   - Linux/macOS: `ip addr` o `ifconfig`
2. En la tablet abre: `http://192.168.1.50:3000/cocina`
3. Si no carga, en Windows permite el puerto 3000 en el firewall (PowerShell como administrador):
   ```powershell
   New-NetFirewallRule -DisplayName "Delycia POS" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
   ```
4. Consejo: fija la IP de la PC en el router (reserva DHCP) para que la dirección no cambie.

## Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Tests (Vitest) |
| `npm run lint` | ESLint (incluye las reglas de fronteras entre módulos) |
| `npm run typecheck` | Verificación de tipos |
| `npm run db:migrate` | Crea/aplica migraciones en desarrollo |
| `npm run db:seed` | Carga datos de ejemplo |

## Hoja de ruta

- [x] 1. Setup y estructura
- [ ] 2. Modelo de datos
- [ ] 3. Catálogo
- [ ] 4. Pantalla POS y carrito
- [ ] 5. Envío a cocina + KDS en tiempo real
- [ ] 6. Cobro y ticket
- [ ] 7. Anulaciones e historial

Después: reportería, despliegue en AWS (Terraform + GitHub Actions), inventario y costos.
