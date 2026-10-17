# Estado actual de la app — 17/10/2026

86 tests pasando (`npm test`), lint y typecheck limpios. Último trabajo: extras como modificadores (menú v2).

## Hecho

Catálogo (CRUD, modificadores, modificador a toda una categoría) · login PIN con 3 perfiles · pantalla de venta
(canal Local/PEYA, comer aquí/para llevar por ítem, mesa y cliente) · envío a cocina solo de ítems nuevos y
adicionales · KDS en tiempo real (alarma ~6 s, deshacer, imprimir comanda 80 mm, "lista" = entregada) ·
mensajes caja→cocina con "visto" · cobro (descuento, vuelto, pago mixto, ticket 80 mm) · cuentas por cobrar
con abonos · historial con filtros y detalle · apertura de caja (no editable) · cierre con arqueo
efectivo/QR/tarjeta, PDF, CSV y 80 mm · menú real (55 productos) con actualizaciones versionadas.

## Pendiente (app)

1. **Anulaciones** (ítem u orden con motivo; ítem ya en cocina → comanda marcada ANULADA). Pospuesto por Yasser.
   Los estados y campos (`VOIDED`, `CANCELLED`, `voidReason`, `refundedAt`) ya existen en el modelo.
2. ✅ Seguridad de login: PIN fuera del repo, cambio en Ajustes, bloqueo tras 5 fallos. Sin HTTPS por decisión.
   Limitación: cambiar un PIN no cierra las sesiones abiertas (la cookie dura hasta 14 h).
3. **Respaldo** automático de la base.
4. Precios de **Extra cheddar** y **Extra mozzarella** (Yasser los carga con "+ Modificador a todos").
5. Renombrar "Hamburguesa Onion Doble/Triple" → lo hace Yasser desde Catálogo.
6. Reportes (ventas por rango, más vendidos, tiempos de cocina); luego inventario, costos/recetas, clientes.
7. Prueba piloto en el local (impresora 80 mm real, tablet de cocina, sonido, IP fija, firewall).

## Bugs / limitaciones conocidas

- Sin anulaciones: un cobro o envío a cocina por error no se puede revertir desde la app.
- La apertura de caja no se puede corregir ni por Admin (decisión de Yasser); un error requiere tocar la base.
- Cuentas por cobrar agrupadas por **texto** del nombre (no hay entidad Cliente).
- El reporte de productos agrupa por la **categoría actual** del producto (si se renombra/mueve, cambia el
  agrupado histórico) y muestra montos **antes** del descuento de la orden.
- `removeExampleCatalog` borra en cada arranque cualquier producto cuyo nombre termine en "(ejemplo)".
- Sonidos (Web Audio) e impresión 80 mm no probados en dispositivos reales.
- Aviso de hidratación en `/historial` solo aparece con Playwright (inyecta `caret-color` en el input de fecha).

## Deuda técnica

- Hub SSE en memoria → no escala a más de una instancia (cambiar a Postgres `LISTEN/NOTIFY` si hiciera falta).
- `TicketStatus.DELIVERED` quedó solo por compatibilidad (READY es el final).
- `OrderItem.productId` sin FK (a propósito, por los snapshots); no hay borrado real de productos en la UI.
- Los scripts E2E de Playwright usados en las pruebas viven fuera del repo: falta suite E2E versionada.
- No hay tests de componentes UI.
- `.npmrc` con `legacy-peer-deps` por un bug de npm 10.9.
- Algunos commits intermedios pueden no compilar solos (cambios repartidos en varios commits).
- Componentes shadcn escritos a mano (el registry estaba bloqueado); `components.json` queda listo para `npx shadcn add` cuando haya acceso.
