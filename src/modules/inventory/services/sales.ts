import type { Tx } from "@/core/db/transaction";
import { Decimal } from "@/core/quantity";
import type { SalesChannel, ServiceType } from "@/generated/prisma/enums";
import { resolveConsumption } from "@/modules/catalog";

import { recordMovements } from "./stock";

type SoldItem = { orderItemId: string; productId: string; quantity: number; serviceType: ServiceType; modifiers: string[] };

/**
 * Descuenta stock por ítems vendidos. Se llama al enviar a cocina y al cobrar: descuenta solo los ítems
 * que todavía no se descontaron (idempotente por `orderItemId`). PEYA cuenta siempre como para llevar.
 */
export async function discountSoldItems(tx: Tx, orderId: string, channel: SalesChannel, items: SoldItem[], userId?: string | null) {
  if (items.length === 0) return;
  const done = await tx.stockMovement.findMany({
    where: { refType: "ORDER", refId: orderId, type: { in: ["SALE", "SALE_REVERSAL"] }, refLineId: { in: items.map((i) => i.orderItemId) } },
    select: { refLineId: true },
  });
  // Un ítem sin receta no deja movimientos: si después se le carga receta, descontaría al cobrar (aceptado).
  const handled = new Set(done.map((d) => d.refLineId));
  const pending = items.filter((i) => !handled.has(i.orderItemId));
  if (pending.length === 0) return;

  const consumption = await resolveConsumption(
    pending.map((i) => ({
      lineId: i.orderItemId,
      productId: i.productId,
      quantity: i.quantity,
      serviceType: channel === "PEYA" ? "TAKEAWAY" : i.serviceType,
      modifiers: i.modifiers,
    })),
    tx,
  );
  await recordMovements(
    tx,
    consumption.map((c) => ({
      productId: c.componentId,
      type: "SALE" as const,
      quantity: c.quantity.neg(),
      unitCostCents: c.unitCostCents,
      refType: "ORDER",
      refId: orderId,
      refLineId: c.lineId,
      userId,
    })),
  );
}

/** Revierte lo que descontó la venta (todo el pedido o solo un ítem). No recalcula con la receta actual. */
export async function reverseSale(tx: Tx, orderId: string, orderItemId?: string) {
  const movements = await tx.stockMovement.findMany({
    where: { refType: "ORDER", refId: orderId, ...(orderItemId ? { refLineId: orderItemId } : {}) },
  });
  const reversed = new Set(movements.filter((m) => m.type === "SALE_REVERSAL").map((m) => m.refLineId));
  const toReverse = movements.filter((m) => m.type === "SALE" && !reversed.has(m.refLineId));
  await recordMovements(
    tx,
    toReverse.map((m) => ({
      productId: m.productId,
      type: "SALE_REVERSAL" as const,
      quantity: new Decimal(m.quantity).neg(),
      unitCostCents: m.unitCostCents,
      refType: "ORDER",
      refId: orderId,
      refLineId: m.refLineId,
    })),
  );
}
