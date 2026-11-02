# Spec — Mejoras v2 (caja, pagos y libro de caja y bancos)

Observaciones del dueño (Yasser) acordadas el 2026-11-02. **Pendiente de implementar.**
Orden sugerido: 1 → 2 → 3 → 4 → 5. Cada punto en commits pequeños, con tests (Vitest) y verificación
en navegador (Playwright). Si algo no está definido aquí, **preguntar**: no inventar reglas ni cifras.

Respetar la arquitectura de `CLAUDE.md`: monolito modular, eventos de dominio, dinero en centavos,
nada se borra (estados + motivo), permisos en `core/auth/permissions.ts`, export vía `core/export`,
día de negocio en `America/La_Paz`.

## Estado

| # | Mejora | Estado |
|---|---|---|
| 1 | Envío automático a cocina | ✅ Listo |
| 2 | Retiros de efectivo de caja | ✅ Listo |
| 3 | N° de comprobante y cuenta de origen en pagos a proveedores | Pendiente |
| 4 | Reporte "Pagos a proveedores" | Pendiente |
| 5 | Libro de caja y bancos | Pendiente (prioridad) |

Descartado por ahora: módulo "Gastos". Los gastos operativos se registran como **compras** de ítems
de la categoría "Gastos operativos" (transporte, sueldos, servicios, etc.). Quizá a futuro.

---

## 1) Envío automático a cocina (sin excepción)

Problema: hoy "Guardar" y "Cobrar" no mandan a cocina; hay que tocar "Enviar a cocina" y se olvidan.

- **Guardar** (orden por pagar): guarda **y** envía a cocina lo pendiente.
- **Cobrar**: al tocarlo se guarda y se envía a cocina **en ese momento** (antes de completar el cobro),
  aunque luego cierren la ventana de cobro sin cobrar.
- Platos agregados a una orden ya guardada también se envían al guardar.
- Quitar el botón grande "Enviar a cocina" del POS y el `SendToKitchenButton` del diálogo de cobrada
  (`PaidDialog`). Revisar si queda algún uso (ej. "Pagadas, esperando cocina" en Por pagar).
- Ítems que no van a cocina (`sendsToKitchen = false`) siguen sin ir.
- Sin excepción para encargos a futuro (pagan ahora, recogen después): cocina se guía por la nota.
- Revisar órdenes PEYA y para llevar; la idempotencia del descuento de inventario por `orderItemId`
  ya cubre el envío temprano.

## 2) Retiros de efectivo de caja

Hoy no existe: un retiro aparece como faltante en el cierre.

- Botón **"Retiro de efectivo"** visible todo el día en la barra superior.
- Permiso nuevo (ej. `cash.withdraw`), por defecto a **Caja** (migración que lo agregue al rol Caja
  existente) y Admin.
- Campos: **monto** + **motivo** (texto libre, obligatorio). **Sin PIN de autorización**: se autoriza
  por escrito fuera del sistema.
- Guarda quién registró y la hora; cuenta en el día de negocio (La Paz).
- Se puede **anular con motivo** (no se borra).
- **Cierre de caja** (pantalla, `summary` guardado y PDF `/imprimir/cierre`): sección "Retiros" con
  detalle y total; **resta del efectivo esperado**.

## 3) Pagos a proveedores (`SupplierPayment`)

- Campo nuevo opcional **"N° de comprobante / referencia"** (n° de transferencia/QR o recibo del
  proveedor). Distinto del comprobante de la compra (`Purchase.docNumber`).
- Campo **"Cuenta de origen"**: Efectivo (caja) / Banco (QR) / ATC-PeYa (mismas cuentas del punto 5).
  Por defecto según el método (efectivo → Efectivo, transferencia/QR → Banco, tarjeta → ATC-PeYa),
  editable.
- El pago en **efectivo sigue restando del efectivo esperado** del cierre (como hoy).
- Mostrar ambos en el detalle de la compra y en las listas de pagos.

## 4) Reporte "Pagos a proveedores" (Reportes → grupo Compras)

Para cuadrar con los movimientos de caja y, sobre todo, con el extracto del banco.

- Lista **todos los pagos**, independiente de la compra, filtrados por **fecha del pago** y por
  método / cuenta.
- Columnas: fecha, proveedor, compra #, ítems / categoría, método, cuenta, n° de comprobante, monto,
  nota, registrado por.
- Totales por método y por cuenta. Anulados aparte, no suman.
- Export Excel / PDF como los demás reportes (`/api/exportar/<clave>`).

## 5) Libro de caja y bancos (prioridad — reemplaza el cuaderno)

Hoy lo llevan a mano en un cuaderno (Fecha / Detalle / Ingreso / Egreso / Saldo). Quieren **todo
consolidado en una sola pantalla**, armado solo por el sistema (nadie escribe dos veces).

### Cuentas

| Cuenta | Entra | Sale |
|---|---|---|
| Efectivo (caja) | ventas y cobros de fiado en efectivo | pagos a proveedores en efectivo, retiros, traspasos al banco |
| Banco (QR) | ventas y cobros por QR, traspasos recibidos | pagos a proveedores por transferencia/QR |
| ATC / PeYa | ventas con tarjeta y con PeYa | traspasos al banco (+ comisión) |

### Movimientos (cronológicos, con saldo acumulado por cuenta y total)

- **Ingresos**: ventas cobradas por medio de pago (EFECTIVO → Efectivo, QR → Banco, TARJETA y PEYA →
  ATC/PeYa) y cobros de fiados por fecha del abono. **Lo fiado no entra hasta que se cobra.**
- **Egresos**: pagos a proveedores (por fecha del pago y cuenta de origen; **las compras a crédito no
  entran hasta pagarse**) y retiros de efectivo. Mostrar ítem y categoría en el detalle para distinguir
  "Gastos operativos" de mercadería.
- Anulaciones / devoluciones (pagos con `refundedAt`) deben reflejarse coherentes con el cierre.
- El libro debe cuadrar: saldo Efectivo con los cierres de caja; Banco con el extracto bancario.

### Traspasos entre cuentas

- "Depósito / traspaso" (ej. ATC/PeYa → Banco, Efectivo → Banco): sale de una cuenta y entra en otra;
  no es ingreso ni gasto.
- PeYa y ATC depositan **ya descontada la comisión**: se ingresa monto que sale y monto que llega, y la
  diferencia se registra **sola** como egreso "Comisión".
- Un traspaso desde Efectivo resta del efectivo esperado del cierre de caja.
- Anulable con motivo.

### Otros

- **Saldos iniciales** por cuenta (se cargan una vez, con fecha).
- Filtros: rango de fechas y cuenta. Export Excel / PDF.
- Permisos nuevos para ver el libro y para registrar traspasos / saldos iniciales: Admin por defecto
  (preguntar si se da a otro rol; Harumi registra gastos y lleva el control).

## Al terminar

Actualizar `CLAUDE.md` y `docs/estado-actual.md` con lo nuevo y marcar el estado en la tabla de arriba.

## Decisiones (Yasser, 02/11/2026)

- Libro de caja y bancos: las **ventas cobradas** van en **una línea por día y medio de pago** (ej. "Ventas en
  efectivo"); pagos a proveedores, cobros de fiado, retiros y traspasos van uno por uno.
- Libro, cuenta Efectivo: si el cierre de caja tiene faltante o sobrante, se agrega una línea **"Diferencia de
  arqueo"** (faltante = egreso, sobrante = ingreso): el saldo Efectivo queda igual a lo contado.
- Libro de caja y bancos (ver y registrar traspasos / saldos iniciales): **solo Admin** por defecto; se puede dar a
  otro rol desde Usuarios → Roles.
- Retiros: los anula quien tiene el permiso de retiros (Caja y Admin), con motivo y **solo el mismo día de negocio**.

## Decisiones técnicas

- Módulo nuevo `treasury` ("Caja y bancos"): retiros, traspasos y saldos iniciales. Ventas lo consulta para el
  cierre (como hace con Compras). El libro se arma en `reports` (solo lectura, SQL) para no crear dependencias
  circulares entre Ventas, Compras y Caja y bancos.
