# Estado actual de la app — 19/10/2026

138 tests pasando (`npm test`), lint y typecheck limpios. Último trabajo: **Fases 1 y 2 de compras/inventario**
(tipos de ítem, unidades, presentaciones, stock mínimo, último costo; recetas con costo y margen). Ver `docs/spec-compras-inventario.md`.

## En curso: compras, inventario y recetas (`docs/spec-compras-inventario.md`)

- ✅ **Fase 1 (código):** migración `tipos_de_item` (solo agrega; todo queda Normal sin stock), Catálogo con tipo,
  unidad base, check de stock, stock mínimo, último costo, presentaciones de compra y filtro por tipo. El POS
  solo muestra Normal y Preparado. Clasificación aprobada (menú v3: platos → Preparado, bebidas → Normal con stock). Pendiente: backup de producción confirmado antes de desplegar.
- ✅ **Fase 2:** recetas (pestaña "Receta y costo" del ítem): Preparado con condición Siempre / Solo para llevar /
  Solo comer aquí, costo y margen para cada caso; Ingrediente con receta de referencia y rendimiento; lo que
  descuenta cada modificador (con "copiar a todos"). Catálogo marca "Sin receta" en Preparados sin receta.
- ✅ **Fase 3:** módulo `purchases` (`/compras`, solo Admin): proveedores, compra con comprobante y líneas
  (presentación o unidad compatible → unidad base, costo unitario, actualiza último costo), contado / crédito /
  pago parcial con vencimiento, abonos (sin sobrepago, estado Pendiente/Parcial/Pagada, anular con motivo), anular
  compra (exige anular antes los pagos; emite `purchase.cancelled`). Cierre de caja: "Pagos a proveedores"; el
  efectivo resta del esperado (pantalla, PDF y 80 mm).
- Sigue: **Fase 4** (inventario).

## Hecho

Catálogo (CRUD, modificadores, modificador a toda una categoría) · login PIN con 3 perfiles · pantalla de venta
(canal Local/PEYA, comer aquí/para llevar por ítem, mesa y cliente) · envío a cocina solo de ítems nuevos y
adicionales · KDS en tiempo real (alarma ~6 s, deshacer, imprimir comanda 80 mm, "lista" = entregada) ·
mensajes caja→cocina con "visto" · cobro (descuento, vuelto, pago mixto, ticket 80 mm) · cuentas por cobrar
con abonos · historial con filtros y detalle · apertura de caja (no editable) · cierre con arqueo
efectivo/QR/tarjeta, PDF, CSV y 80 mm · menú real (55 productos) con actualizaciones versionadas ·
**anulaciones** de ítem u orden (motivo obligatorio, PIN de Admin desde Caja, aviso en cocina hasta "Entendido",
pagos devueltos, aparte en historial y cierre) · **tema claro/oscuro** por dispositivo (POS claro, Cocina oscuro) ·
**Reportes** (solo Admin): ventas por canal = medio de pago (por día, totales, barras) y productos vendidos
(filtro por categoría, orden por cantidad o monto), **Anulaciones** (detalle, por motivo) y **Cuentas por
cobrar** (por cliente, estado, saldo y método de pago), con atajos Hoy/Ayer/7 días/Este mes; "Dinero cobrado"
(ventas sin fiado + abonos) separado de la venta · **Exportar PDF/Excel** en todos los reportes y el Historial ·
cocina: anulada queda a la vista hasta "Entendido" y luego pasa a Recientes con hora y motivo.

## Pendiente (app)

1. ✅ Anulaciones. Pendiente de decidir: anular una orden cobrada de un día anterior (hoy se bloquea porque esa
   caja ya cerró; haría falta registrar la devolución en la caja del día en que se hace).
2. ✅ Seguridad de login: PIN fuera del repo, cambio en Ajustes, bloqueo tras 5 fallos. Sin HTTPS por decisión.
   Limitación: cambiar un PIN no cierra las sesiones abiertas (la cookie dura hasta 14 h).
3. **Respaldo** automático de la base.
4. Precios de **Extra cheddar** y **Extra mozzarella** (Yasser los carga con "+ Modificador a todos").
5. Renombrar "Hamburguesa Onion Doble/Triple" → lo hace Yasser desde Catálogo.
6. ✅ Reportes (ventas, productos, anulaciones, fiados) con exportación. Faltan: tiempos de cocina; luego
   inventario, costos/recetas, clientes (hoy el cliente del fiado es el nombre escrito, sin teléfono).
7. Prueba piloto en el local (impresora 80 mm real, tablet de cocina, sonido, IP fija, firewall). La app ya corre
   en la EC2 de prueba (ver `docs/infra.md`).

## Bugs / limitaciones conocidas

- Una orden cobrada solo se anula el mismo día; un fiado con abonos no se puede anular.
- Reportes: un pago mixto cuenta en cada canal usado (el total del día cuenta la orden una vez); productos
  agrupados por la **categoría actual** y montos antes del descuento de la orden (igual que el cierre).
- Fiados: el cliente se identifica por el nombre escrito (se agrupa sin mayúsculas/tildes/espacios); dos
  personas con el mismo nombre se juntan. Sin teléfono (decisión de Yasser).
- Exportes: el PDF usa fuentes estándar (Latin-1): emojis u otros símbolos salen como "?".
- El tema se guarda en el navegador: si se borran los datos del navegador vuelve al de por defecto.
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
