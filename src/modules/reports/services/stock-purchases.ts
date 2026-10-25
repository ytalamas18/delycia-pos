import { Decimal } from "@/core/quantity";
import { listAdjustments, listStockItems, withRunningBalance, itemMovements } from "@/modules/inventory";
import { listTrackedItems } from "@/modules/catalog";
import { listPayables, listPurchases } from "@/modules/purchases";

import type { DateRange } from "../domain/range";

/*
 * Reportes de Inventario y Compras: se leen por la API pública de esos módulos (solo lectura).
 */

export async function getStockReport(filters: { type?: string | null; categoryId?: string | null; onlyAlerts?: boolean }) {
  const items = (await listStockItems(filters)).filter((i) => i.active && (!filters.onlyAlerts || i.level !== "ok"));
  const totalValueCents = items.reduce((s, i) => s.add(i.valueCents && i.stock.isPositive() ? i.valueCents : 0), new Decimal(0));
  return { items, totalValueCents };
}

export async function getKardexReport(productId: string | null, range: DateRange) {
  const items = (await listTrackedItems()).map((i) => ({ id: i.id, name: i.name }));
  if (!productId) return { items, item: null, rows: [], opening: new Decimal(0) };
  const [item] = await listTrackedItems({ ids: [productId] });
  if (!item) return { items, item: null, rows: [], opening: new Decimal(0) };
  const { movements, opening } = await itemMovements(productId, range);
  return { items, item, rows: withRunningBalance(movements, opening), opening };
}

export async function getAdjustmentsReport(range: DateRange) {
  const rows = await listAdjustments(range);
  const lost = rows.filter((r) => r.difference.isNegative()).reduce((s, r) => s.add(r.valueCents ?? 0), new Decimal(0));
  const surplus = rows.filter((r) => r.difference.isPositive()).reduce((s, r) => s.add(r.valueCents ?? 0), new Decimal(0));
  return { rows, lostCents: lost.neg(), surplusCents: surplus };
}

/** Compras vigentes del período: totales, por proveedor y por ítem. */
export async function getPurchasesReport(range: DateRange) {
  const purchases = (await listPurchases({ from: range.from, to: range.to })).filter((p) => p.status === "ACTIVE");
  const bySupplier = new Map<string, { name: string; count: number; totalCents: number; balanceCents: number }>();
  const byItem = new Map<string, { name: string; quantity: Decimal; totalCents: number }>();
  for (const p of purchases) {
    const key = p.supplier?.id ?? "-";
    const s = bySupplier.get(key) ?? { name: p.supplier?.name ?? "Sin proveedor", count: 0, totalCents: 0, balanceCents: 0 };
    s.count += 1;
    s.totalCents += p.totalCents;
    s.balanceCents += p.balanceCents;
    bySupplier.set(key, s);
    for (const l of p.lines) {
      const it = byItem.get(l.productId) ?? { name: l.productName, quantity: new Decimal(0), totalCents: 0 };
      it.quantity = it.quantity.add(l.baseQuantity);
      it.totalCents += l.totalCents;
      byItem.set(l.productId, it);
    }
  }
  return {
    purchases,
    totalCents: purchases.reduce((s, p) => s + p.totalCents, 0),
    paidCents: purchases.reduce((s, p) => s + p.paidCents, 0),
    balanceCents: purchases.reduce((s, p) => s + p.balanceCents, 0),
    bySupplier: [...bySupplier.values()].sort((a, b) => b.totalCents - a.totalCents),
    byItem: [...byItem.values()].sort((a, b) => b.totalCents - a.totalCents),
  };
}

/** Cuentas por pagar actuales (no depende del rango), con abonos y vista por proveedor. */
export async function getPayablesReport() {
  const rows = await listPayables();
  const bySupplier = new Map<string, { name: string; count: number; balanceCents: number; overdueCents: number }>();
  for (const p of rows) {
    const key = p.supplier?.id ?? "-";
    const g = bySupplier.get(key) ?? { name: p.supplier?.name ?? "Sin proveedor", count: 0, balanceCents: 0, overdueCents: 0 };
    g.count += 1;
    g.balanceCents += p.balanceCents;
    if (p.overdue) g.overdueCents += p.balanceCents;
    bySupplier.set(key, g);
  }
  return {
    rows,
    totalCents: rows.reduce((s, p) => s + p.balanceCents, 0),
    overdueCents: rows.filter((p) => p.overdue).reduce((s, p) => s + p.balanceCents, 0),
    bySupplier: [...bySupplier.values()].sort((a, b) => b.balanceCents - a.balanceCents),
  };
}
