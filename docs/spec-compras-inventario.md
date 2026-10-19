# Spec: tipos de ítem, recetas, compras, inventario y reportes

> **Fuente de verdad** de este cambio. Las sesiones nuevas deben leer este archivo, `CLAUDE.md` y
> `docs/estado-actual.md` antes de continuar. Especificación escrita por Yasser (19/10/2026).

## Estado de las fases

| Fase | Estado |
|---|---|
| 1. Catálogo: tipos, unidades, presentaciones, stock mínimo + migración segura + propuesta de clasificación | ✅ Código listo (migración `tipos_de_item`). Falta: backup de producción confirmado por Yasser + aprobar clasificación (se aplicará como `MENU_UPDATES` v3) |
| 2. Recetas (Preparado e Ingrediente) con costo y margen | Pendiente |
| 3. Proveedores, compras, crédito y abonos | Pendiente |
| 4. Inventario: movimientos, descuento por ventas, ingreso a inventario, conteo físico y alertas | Pendiente |
| 5. Carga rápida e importación desde Excel/CSV | Pendiente |
| 6. Reportes de inventario y compras | Pendiente |

Forma de trabajo:
- Una fase a la vez, con commit, y decir cómo probarla.
- Al terminar cada fase, actualizar `docs/estado-actual.md` (y la tabla de arriba) indicando qué fase quedó lista y cuál sigue.
- Si el contexto supera el 90%, avisar para continuar en una sesión nueva.
- Respuestas cortas.

## Decisiones tomadas (19/10/2026, aprobadas por Yasser)

- **Ítem = `Product`** con campos nuevos (`type`, `baseUnit`, `tracksStock`, `minStock`, `lastCostCents`,
  `lastCostAt`) + tabla `ProductPresentation`. Cantidades `Decimal(12,3)`; costo unitario en centavos
  `Decimal(14,4)` (1 g puede costar menos de 1 centavo); totales en centavos `Int`.
- Unidades: kg ↔ g y litro ↔ ml se convierten solos; además, presentaciones con factor (`catalog/domain/units.ts`).
- Insumo/Ingrediente guardan `priceCents = 0` y `sendsToKitchen = false`. Preparado: siempre `UNIT`, sin stock.
- **Eventos de Ventas:** se agregan datos a los payloads (ej. `productId`, ítems en `order.paid`,
  modificadores con id) sin cambiar la lógica de Ventas. Inventario descuenta con el primer evento que llegue
  (envío a cocina o cobro) y no repite (idempotente por `orderItemId`). Al anular, revierte los movimientos que
  guardó (no recalcula con la receta actual).
- **Modificadores:** sí deben descontar stock (ej. "Extra queso"). Plan: receta propia por modificador (Fase 2/4).
  Si se complica, se deja para después y se anota aquí.
- **Pagos a proveedores en efectivo** restan del efectivo esperado del cierre de caja y aparecen en el cierre
  como línea aparte "Pagos a proveedores" (por fecha del pago/abono). QR/transferencia/tarjeta, igual por canal.
- **Permisos:** Compras e Inventario solo Admin por ahora (`purchases.manage`, `inventory.manage`).
- **Anular compra con abonos:** se exige anular primero los abonos.
- Cambiar la unidad base de un ítem con movimientos de stock: se bloqueará en la Fase 4.
- Clasificación de productos actuales: se aplica como actualización de menú versionada (`MENU_UPDATES` v3,
  por categoría) solo con lo que Yasser apruebe.

Fuera de alcance: gastos que no son ítems (luz, gas, alquiler, sueldos). Van en un módulo "Gastos" más adelante.

---

# 1. Tipos de ítem (catálogo)

El "tipo" define cómo se comporta el ítem. Es distinto de la "categoría", que
solo sirve para agrupar (Bebidas, Hamburguesas, Condimentos, etc.) y sigue
existiendo para todos los tipos.

| Tipo | Ejemplo | ¿Se vende en POS? | Receta | Stock |
|---|---|---|---|---|
| Normal | Gaseosa | Sí | No | Solo si tiene el check de compra |
| Preparado | Hamburguesa | Sí | Sí (descuenta stock al vender) | Nunca |
| Ingrediente | Carne de hamburguesa | No | Sí (solo referencia de costo) | Siempre |
| Insumo | Carne molida, Doña Gusta, pan | No | No | Solo si tiene el check de compra |

Reglas:
- Check por ítem: "Suma al inventario al registrar compra". Disponible en
  Normal, Ingrediente e Insumo. El tipo Preparado NO aparece en Compras.
- En el POS solo aparecen Normal y Preparado.
- Campo "stock mínimo" para todo ítem que maneje stock.
- Último costo por ítem (se actualiza con cada compra).

## Unidades
- Cada ítem tiene una unidad base (unidad, kg, g, litro, ml).
- Opcionalmente, presentaciones de compra con factor de conversión
  (ej. "Bolsa x12" = 12 unidades). Al comprar "2 bolsas", suma 24 unidades.
- Las recetas siempre usan la unidad base.

# 2. Recetas

## Receta de un Preparado (ej. Hamburguesa)
- Lista de componentes con cantidad: pueden ser Ingredientes, Insumos o
  Normales (no otros Preparados).
- Al vender, se descuentan del stock SOLO los componentes que manejan stock.
  Los que no tienen stock se ignoran.
- Si un Preparado no tiene receta cargada, se vende igual y no descuenta nada.
- Muestra el costo estimado del plato y su margen frente al precio de venta.

## Receta de un Ingrediente (ej. Carne de hamburguesa)
- Lista de Insumos con cantidad y un rendimiento (ej. rinde 16 unidades).
- Es SOLO de referencia para calcular el costo unitario con el último costo de
  cada insumo. NO descuenta stock de nada.

# 3. Ingreso a inventario (producción de Ingredientes)
- Registro: ingrediente, cantidad producida, fecha, nota opcional.
- Suma la cantidad al stock del ingrediente.
- Calcula y guarda el costo unitario según su receta de referencia
  (editable si ese día fue distinto).
- NO registra ningún gasto: el gasto ya se registró al comprar los insumos.
  El costo solo sirve para valorizar el inventario y calcular márgenes.

# 4. Compras

## Proveedores
- CRUD simple: nombre, teléfono, RUC/documento opcional, nota.

## Registro de compra
- Fecha, proveedor, comprobante (boleta / factura / sin comprobante) y número.
- Líneas: ítem (no Preparado), presentación o unidad, cantidad y total de la
  línea. El sistema calcula el costo unitario.
- Total de la compra.
- Forma de pago:
  - Contado: pagada completa (indicar el método: efectivo, transferencia, tarjeta).
  - Crédito: no se paga nada ahora.
  - Pago parcial: se paga una parte ahora (monto y método) y el resto queda pendiente.
- En crédito o pago parcial, el proveedor es obligatorio; la fecha de
  vencimiento es opcional.

Al guardar:
- Se registra el gasto por el TOTAL en la fecha de la compra, aunque no esté pagada.
- Los ítems con el check suman al stock (convertidos a unidad base).
- Se actualiza el último costo de cada ítem.

## Cuentas por pagar y abonos
- Registrar abonos a una compra: fecha, monto, método de pago. Varios abonos
  por compra.
- No permitir abonar más que el saldo pendiente.
- Estado automático: Pendiente / Parcial / Pagada.
- La salida de dinero se registra en la fecha de cada abono (no en la de la compra).
- Anular un abono: con motivo, recalcula el saldo y el estado.

## Anular una compra
- Con motivo obligatorio. Revierte el stock que había sumado.
- Si tiene abonos, proponer cómo manejarlo (recomendación: exigir anular
  primero los abonos).

# 5. Inventario

## Movimientos (kárdex)
- Todo cambio de stock es un movimiento: tipo (compra, ingreso a inventario,
  venta, anulación de venta, anulación de compra, ajuste por conteo), ítem,
  cantidad (+/-), costo, fecha, usuario y referencia al documento de origen.
- El stock se calcula a partir de los movimientos. Nunca se edita a mano.

## Descuento por ventas
- El stock se descuenta cuando la orden se envía a cocina o se cobra, lo que
  ocurra primero (para que las gaseosas que no van a cocina también descuenten).
- Si se anula una orden o un ítem, se revierte el descuento.
- Stock negativo PERMITIDO: la venta no se bloquea, pero se muestra una alerta
  y el ítem queda resaltado en los reportes.
- Usar los eventos de dominio existentes (ej. orden enviada, pagada, anulada)
  para que el módulo de inventario reaccione sin modificar la lógica de ventas.

## Conteo físico
- Pantalla para ingresar lo contado de varios ítems a la vez.
- El sistema calcula la diferencia contra el stock teórico y la registra como
  ajuste (merma o sobrante), con motivo opcional.

## Alertas
- Indicador visible en el sistema cuando hay ítems bajo el stock mínimo o en negativo.

# 6. Carga rápida (puesta en marcha)
Pantalla para cargar muchos ítems de una vez, en formato tabla editable:
- Nombre, tipo, categoría, unidad base, check de compra, stock mínimo,
  último costo e inventario inicial.
- También importación desde Excel/CSV con una plantilla descargable.
- El inventario inicial se registra como movimiento de tipo "inventario inicial".

# 7. Migración de los productos actuales
Ya hay datos reales en producción, así que:
1. Antes de migrar, indicar cómo hacer un backup de la base de datos y
   esperar confirmación de Yasser de que lo hizo.
2. La migración agrega los campos nuevos sin borrar ni alterar ventas,
   historial ni reportes existentes.
3. Todos los productos actuales quedan como tipo "Normal" por defecto, sin
   check de stock, para que el POS siga funcionando igual.
4. Revisar el catálogo actual y mostrar una propuesta de clasificación
   (producto → tipo sugerido). Solo aplicar los cambios que Yasser apruebe.
5. El inventario arranca desde el día en que se active; las ventas anteriores
   no descuentan stock.

# 8. Reportes (módulo Reportes)
Todos con filtro de fechas (cuando aplique) y exportación a PDF y Excel,
reutilizando el servicio de exportación que ya existe.

Inventario:
- Stock actual: ítem, tipo, categoría, cantidad, unidad, costo unitario y
  valor total, con total valorizado. Filtros por tipo y categoría.
- Stock bajo: ítems bajo el mínimo o en negativo.
- Kárdex: movimientos de un ítem con saldo acumulado.
- Mermas y ajustes: diferencias por conteo, con valor perdido.

Compras:
- Compras por período, por proveedor y por ítem.
- Cuentas por pagar: compra, proveedor, fecha, total, abonado, saldo, estado,
  vencimiento (vencidas resaltadas), historial de abonos y vista por proveedor
  con el total adeudado.

# Arquitectura
- Módulos nuevos: `/modules/purchases` y `/modules/inventory`, registrados en
  el registro de módulos. Ampliar `/modules/catalog` con tipos, unidades y recetas.
- Comunicación por eventos de dominio, sin acoplar ventas con inventario.
- Montos en enteros o Decimal; cantidades en Decimal (hay kg y gramos).
- Tests de: conversión de unidades, descuento por receta (ignorando ítems sin
  stock), reversa por anulación, cálculo de costo de ingredientes, estados de
  cuentas por pagar, bloqueo de sobrepago y ajustes por conteo.

# Fases
1. Catálogo: tipos, unidades, presentaciones, stock mínimo + migración segura
   + propuesta de clasificación.
2. Recetas (Preparado e Ingrediente) con costo y margen.
3. Proveedores, compras, crédito y abonos.
4. Inventario: movimientos, descuento por ventas, ingreso a inventario,
   conteo físico y alertas.
5. Carga rápida e importación desde Excel/CSV.
6. Reportes de inventario y compras.
