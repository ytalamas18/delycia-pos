import { db } from "@/core/db/client";
import type { Tx } from "@/core/db/transaction";
import type { Decimal } from "@/core/quantity";

import { PURCHASABLE_TYPES } from "../domain/item-types";

const purchasableSelect = {
  id: true,
  name: true,
  type: true,
  baseUnit: true,
  tracksStock: true,
  lastCostCents: true,
  category: { select: { name: true } },
  presentations: { where: { active: true }, select: { id: true, name: true, factor: true }, orderBy: { factor: "asc" as const } },
} as const;

/** Ítems que se pueden comprar (Normal, Ingrediente e Insumo activos) con sus presentaciones. */
export function listPurchasableItems() {
  return db.product.findMany({
    where: { active: true, type: { in: PURCHASABLE_TYPES } },
    select: purchasableSelect,
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
}

export function getPurchasableItem(id: string, client: Tx = db) {
  return client.product.findFirst({ where: { id, type: { in: PURCHASABLE_TYPES } }, select: purchasableSelect });
}

export type PurchasableItem = NonNullable<Awaited<ReturnType<typeof getPurchasableItem>>>;

/** Último costo por unidad base (lo llaman Compras e Inventario dentro de su transacción). */
export async function setLastCost(tx: Tx, productId: string, unitCostCents: Decimal, at: Date = new Date()) {
  await tx.product.update({ where: { id: productId }, data: { lastCostCents: unitCostCents.toDecimalPlaces(4), lastCostAt: at } });
}

/** Ítems que manejan stock (para Inventario), con filtros opcionales por tipo y categoría. */
export function listTrackedItems(filters: { type?: string | null; categoryId?: string | null; ids?: string[] } = {}) {
  return db.product.findMany({
    where: {
      tracksStock: true,
      ...(filters.type ? { type: filters.type as never } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.ids ? { id: { in: filters.ids } } : {}),
    },
    select: {
      id: true,
      name: true,
      type: true,
      active: true,
      baseUnit: true,
      minStock: true,
      lastCostCents: true,
      category: { select: { id: true, name: true } },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
}

/** Ingredientes activos con su costo estimado por receta (para el ingreso a inventario). */
export function listIngredients() {
  return db.product.findMany({
    where: { type: "INGREDIENT", active: true },
    select: { id: true, name: true, baseUnit: true, lastCostCents: true },
    orderBy: { name: "asc" },
  });
}
