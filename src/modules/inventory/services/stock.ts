import { db } from "@/core/db/client";
import type { Tx } from "@/core/db/transaction";
import { Decimal } from "@/core/quantity";
import { businessDate } from "@/core/time";
import type { StockMovementType } from "@/generated/prisma/enums";
import { listTrackedItems } from "@/modules/catalog";

import { stockLevel } from "../domain/stock";

export type NewMovement = {
  productId: string;
  type: StockMovementType;
  quantity: Decimal;
  unitCostCents?: Decimal | null;
  refType: string;
  refId: string;
  refLineId?: string | null;
  note?: string | null;
  userId?: string | null;
  businessDate?: string;
};

/** Guarda movimientos (dentro de la transacción del documento de origen). Ignora cantidades 0. */
export async function recordMovements(tx: Tx, movements: NewMovement[]) {
  const rows = movements.filter((m) => !m.quantity.isZero());
  if (rows.length === 0) return;
  const today = businessDate();
  await tx.stockMovement.createMany({
    data: rows.map((m) => ({
      productId: m.productId,
      type: m.type,
      quantity: m.quantity,
      unitCostCents: m.unitCostCents?.toDecimalPlaces(4) ?? null,
      refType: m.refType,
      refId: m.refId,
      refLineId: m.refLineId ?? null,
      note: m.note ?? null,
      userId: m.userId ?? null,
      businessDate: m.businessDate ?? today,
    })),
  });
}

/** Stock actual (suma de movimientos) de los ítems pedidos, o de todos. */
export async function stockByProduct(productIds?: string[], client: Tx = db): Promise<Map<string, Decimal>> {
  const rows = await client.stockMovement.groupBy({
    by: ["productId"],
    where: productIds ? { productId: { in: productIds } } : {},
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.productId, r._sum.quantity ?? new Decimal(0)]));
}

/** Ítems que manejan stock, con su stock, mínimo, costo y nivel (negativo / bajo / ok). */
export async function listStockItems(filters: { type?: string | null; categoryId?: string | null } = {}) {
  const items = await listTrackedItems(filters);
  const stock = await stockByProduct(items.map((i) => i.id));
  return items.map((i) => {
    const qty = stock.get(i.id) ?? new Decimal(0);
    return {
      ...i,
      stock: qty,
      level: stockLevel(qty, i.minStock),
      valueCents: i.lastCostCents ? qty.mul(i.lastCostCents) : null,
    };
  });
}

export type StockItem = Awaited<ReturnType<typeof listStockItems>>[number];

/** Cuántos ítems activos están en negativo o bajo el mínimo (para el aviso del menú). */
export async function stockAlerts() {
  const items = (await listStockItems()).filter((i) => i.active);
  return {
    negative: items.filter((i) => i.level === "negative").length,
    low: items.filter((i) => i.level === "low").length,
  };
}

/** Movimientos de un ítem en orden (kárdex), con el stock que había antes del primero. */
export async function itemMovements(productId: string, range: { from?: string; to?: string } = {}) {
  const where = { productId, businessDate: { gte: range.from, lte: range.to } };
  const [movements, before] = await Promise.all([
    db.stockMovement.findMany({ where, orderBy: [{ at: "asc" }, { createdAt: "asc" }] }),
    range.from
      ? db.stockMovement.aggregate({ where: { productId, businessDate: { lt: range.from } }, _sum: { quantity: true } })
      : Promise.resolve(null),
  ]);
  return { movements, opening: before?._sum.quantity ?? new Decimal(0) };
}

/** Diferencias de conteo (mermas y sobrantes) en un rango de fechas del conteo. */
export async function listAdjustments(range: { from: string; to: string }) {
  const lines = await db.stockCountLine.findMany({
    where: { difference: { not: 0 }, count: { date: { gte: range.from, lte: range.to } } },
    include: { count: { select: { date: true, note: true } } },
    orderBy: [{ count: { date: "asc" } }, { productName: "asc" }],
  });
  return lines.map((l) => ({
    date: l.count.date,
    productId: l.productId,
    productName: l.productName,
    expected: l.expected,
    counted: l.counted,
    difference: l.difference,
    unitCostCents: l.unitCostCents,
    valueCents: l.unitCostCents ? l.difference.mul(l.unitCostCents) : null,
    reason: l.reason ?? l.count.note,
  }));
}
