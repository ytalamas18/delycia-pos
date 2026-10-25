import { db } from "@/core/db/client";
import { eventBus } from "@/core/db/transaction";
import { DomainError } from "@/core/errors";
import { registerProductGuard } from "@/core/hooks/product-guards";
import { Decimal } from "@/core/quantity";

import { discountSoldItems, reverseSale } from "./services/sales";
import { recordMovements } from "./services/stock";

/**
 * Inventario reacciona a Compras y Ventas DENTRO de su transacción (todo o nada).
 * Ventas no sabe nada de inventario: solo publica sus eventos.
 */
export function registerInventorySubscribers() {
  // --- Compras ---
  eventBus.onTransaction("purchase.registered", async ({ payload }, tx) => {
    await recordMovements(
      tx,
      payload.lines
        .filter((l) => l.addsStock)
        .map((l) => ({
          productId: l.productId,
          type: "PURCHASE" as const,
          quantity: new Decimal(l.baseQuantity),
          unitCostCents: new Decimal(l.unitCostCents),
          refType: "PURCHASE",
          refId: payload.purchaseId,
          refLineId: l.lineId,
          businessDate: payload.date,
        })),
    );
  });

  eventBus.onTransaction("purchase.cancelled", async ({ payload }, tx) => {
    const movements = await tx.stockMovement.findMany({ where: { refType: "PURCHASE", refId: payload.purchaseId, type: "PURCHASE" } });
    await recordMovements(
      tx,
      movements.map((m) => ({
        productId: m.productId,
        type: "PURCHASE_REVERSAL" as const,
        quantity: new Decimal(m.quantity).neg(),
        unitCostCents: m.unitCostCents,
        refType: "PURCHASE",
        refId: payload.purchaseId,
        refLineId: m.refLineId,
        note: payload.reason,
      })),
    );
  });

  // --- Ventas: se descuenta con lo primero que pase (envío a cocina o cobro) ---
  const toItems = (items: { orderItemId: string; productId: string; quantity: number; serviceType: "DINE_IN" | "TAKEAWAY"; modifiers: string[] }[]) =>
    items.map((i) => ({ orderItemId: i.orderItemId, productId: i.productId, quantity: i.quantity, serviceType: i.serviceType, modifiers: i.modifiers }));

  eventBus.onTransaction("order.sent_to_kitchen", async ({ payload }, tx) => {
    await discountSoldItems(tx, payload.orderId, payload.channel, toItems(payload.items));
  });
  eventBus.onTransaction("order.paid", async ({ payload }, tx) => {
    await discountSoldItems(tx, payload.orderId, payload.channel, toItems(payload.items));
  });
  eventBus.onTransaction("order.item_voided", async ({ payload }, tx) => {
    await reverseSale(tx, payload.orderId, payload.orderItemId);
  });
  eventBus.onTransaction("order.cancelled", async ({ payload }, tx) => {
    await reverseSale(tx, payload.orderId);
  });

  // --- Catálogo: no cambiar la unidad de un ítem que ya tiene movimientos ---
  registerProductGuard(async ({ productId, before, after }) => {
    if (before.baseUnit === after.baseUnit) return;
    const count = await db.stockMovement.count({ where: { productId } });
    if (count > 0) {
      throw new DomainError("Ya tiene movimientos de stock en la unidad actual: no se puede cambiar la unidad.", {
        baseUnit: "Tiene movimientos de stock",
      });
    }
  });
}
