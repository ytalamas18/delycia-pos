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

/** Lo descontado hoy (neto) por línea de orden y componente: SALE − SALE_REVERSAL. */
async function netByLine(tx: Tx, orderId: string, orderItemId?: string) {
  const movements = await tx.stockMovement.findMany({
    where: { refType: "ORDER", refId: orderId, type: { in: ["SALE", "SALE_REVERSAL"] }, ...(orderItemId ? { refLineId: orderItemId } : {}) },
  });
  const net = new Map<string, { lineId: string; productId: string; quantity: Decimal; unitCostCents: Decimal | null }>();
  for (const m of movements) {
    const key = `${m.refLineId}|${m.productId}`;
    const row = net.get(key) ?? { lineId: m.refLineId ?? "", productId: m.productId, quantity: new Decimal(0), unitCostCents: m.unitCostCents };
    row.quantity = row.quantity.add(m.quantity);
    if (m.type === "SALE") row.unitCostCents = m.unitCostCents;
    net.set(key, row);
  }
  return { lines: new Set(movements.map((m) => m.refLineId)), net: [...net.values()] };
}

/**
 * Revierte lo que descontó la venta (todo el pedido o solo un ítem): devuelve lo que quede descontado en neto,
 * así funciona aunque el ítem se haya cambiado de cantidad. No recalcula con la receta actual. Idempotente.
 */
export async function reverseSale(tx: Tx, orderId: string, orderItemId?: string) {
  const { net } = await netByLine(tx, orderId, orderItemId);
  await recordMovements(
    tx,
    net
      .filter((n) => n.quantity.isNegative())
      .map((n) => ({
        productId: n.productId,
        type: "SALE_REVERSAL" as const,
        quantity: n.quantity.neg(),
        unitCostCents: n.unitCostCents,
        refType: "ORDER",
        refId: orderId,
        refLineId: n.lineId,
      })),
  );
}

/**
 * Caja cambió cantidad o "para llevar" de un ítem que ya descontó stock (envío a cocina): se descuenta o devuelve
 * solo la diferencia con lo que corresponde ahora. Si todavía no descontó, no hace nada (descontará al cobrar).
 */
export async function adjustSoldItem(tx: Tx, orderId: string, channel: SalesChannel, item: SoldItem) {
  const { lines, net } = await netByLine(tx, orderId, item.orderItemId);
  if (!lines.has(item.orderItemId)) return;
  const wanted = await resolveConsumption(
    [
      {
        lineId: item.orderItemId,
        productId: item.productId,
        quantity: item.quantity,
        serviceType: channel === "PEYA" ? "TAKEAWAY" : item.serviceType,
        modifiers: item.modifiers,
      },
    ],
    tx,
  );
  const target = new Map<string, { quantity: Decimal; unitCostCents: Decimal | null }>();
  for (const c of wanted) {
    const t = target.get(c.componentId) ?? { quantity: new Decimal(0), unitCostCents: c.unitCostCents };
    t.quantity = t.quantity.add(c.quantity.neg());
    target.set(c.componentId, t);
  }
  const current = new Map(net.map((n) => [n.productId, n]));
  const products = new Set([...target.keys(), ...current.keys()]);
  const moves = [];
  for (const productId of products) {
    const want = target.get(productId)?.quantity ?? new Decimal(0);
    const have = current.get(productId)?.quantity ?? new Decimal(0);
    const delta = want.sub(have); // negativo = descontar más; positivo = devolver
    if (delta.isZero()) continue;
    moves.push({
      productId,
      type: delta.isNegative() ? ("SALE" as const) : ("SALE_REVERSAL" as const),
      quantity: delta,
      unitCostCents: target.get(productId)?.unitCostCents ?? current.get(productId)?.unitCostCents ?? null,
      refType: "ORDER",
      refId: orderId,
      refLineId: item.orderItemId,
      note: "Cambio en la orden",
    });
  }
  await recordMovements(tx, moves);
}
