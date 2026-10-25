import { db } from "@/core/db/client";
import { runInTransaction } from "@/core/db/transaction";
import { DomainError } from "@/core/errors";
import { Decimal } from "@/core/quantity";
import { listTrackedItems, parseUnitCost, recipeEstimate, setLastCost, unitCosts } from "@/modules/catalog";

import { countDifference } from "../domain/stock";
import { consumptionInput, countInput, productionInput, type ConsumptionInput, type CountInput, type ProductionInput } from "../schemas";
import { recordMovements, stockByProduct } from "./stock";

/**
 * Ingreso a inventario (producción de un Ingrediente): suma stock y guarda el costo unitario
 * (el estimado por su receta, o el que se escriba si ese día fue distinto). NO registra gasto.
 */
export async function createProduction(input: ProductionInput, userId: string) {
  const data = productionInput.parse(input);
  const [item] = await listTrackedItems({ ids: [data.productId], type: "INGREDIENT" });
  if (!item) throw new DomainError("Elige un Ingrediente.", { productId: "Elige un Ingrediente" });
  let unitCostCents: Decimal | null = null;
  if (data.unitCost) {
    try {
      unitCostCents = parseUnitCost(data.unitCost);
    } catch {
      throw new DomainError("Costo inválido", { unitCost: "Costo inválido" });
    }
  } else {
    // Estimado por la receta de referencia (último costo de los insumos ÷ rendimiento); si no hay receta, el último costo.
    unitCostCents = (await recipeEstimate(item.id)) ?? item.lastCostCents;
  }
  return runInTransaction(async (tx) => {
    const entry = await tx.productionEntry.create({
      data: { productId: item.id, productName: item.name, quantity: data.quantity, unitCostCents, date: data.date, note: data.note, userId },
    });
    await recordMovements(tx, [
      {
        productId: item.id,
        type: "PRODUCTION",
        quantity: data.quantity,
        unitCostCents,
        refType: "PRODUCTION",
        refId: entry.id,
        note: data.note,
        userId,
        businessDate: data.date,
      },
    ]);
    if (unitCostCents) await setLastCost(tx, item.id, unitCostCents);
    return entry;
  });
}

/**
 * Conteo físico: compara lo contado con el stock teórico y registra la diferencia como ajuste
 * (merma si falta, sobrante si sobra). Lo que coincide no genera movimiento.
 */
export async function createCount(input: CountInput, userId: string) {
  const data = countInput.parse(input);
  const ids = data.lines.map((l) => l.productId);
  if (new Set(ids).size !== ids.length) throw new DomainError("Un ítem aparece dos veces en el conteo.");
  const items = await listTrackedItems({ ids });
  if (items.length !== ids.length) throw new DomainError("Solo se cuentan ítems que manejan stock.");
  const byId = new Map(items.map((i) => [i.id, i]));
  const costs = await unitCosts(ids);
  return runInTransaction(async (tx) => {
    const stock = await stockByProduct(ids, tx);
    const lines = data.lines.map((l) => {
      const expected = stock.get(l.productId) ?? new Decimal(0);
      return {
        productId: l.productId,
        productName: byId.get(l.productId)!.name,
        expected,
        counted: l.counted,
        difference: countDifference(expected, l.counted),
        unitCostCents: costs.get(l.productId) ?? null,
        reason: l.reason,
      };
    });
    const count = await tx.stockCount.create({
      data: { date: data.date, note: data.note, userId, lines: { create: lines } },
      include: { lines: true },
    });
    await recordMovements(
      tx,
      count.lines.map((l) => ({
        productId: l.productId,
        type: "ADJUSTMENT" as const,
        quantity: new Decimal(l.difference),
        unitCostCents: l.unitCostCents,
        refType: "COUNT",
        refId: count.id,
        refLineId: l.id,
        note: l.reason,
        userId,
        businessDate: data.date,
      })),
    );
    return count;
  });
}

/** Salida rápida (ej. envase para sobras): resta stock con motivo. La usan Caja y Admin. */
export async function createConsumption(input: ConsumptionInput, userId: string) {
  const data = consumptionInput.parse(input);
  const [item] = await listTrackedItems({ ids: [data.productId] });
  if (!item) throw new DomainError("Ese ítem no maneja stock.", { productId: "Elige un ítem con stock" });
  const costs = await unitCosts([item.id]);
  return runInTransaction(async (tx) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await recordMovements(tx, [
      {
        productId: item.id,
        type: "CONSUMPTION",
        quantity: data.quantity.neg(),
        unitCostCents: costs.get(item.id) ?? null,
        refType: "CONSUMPTION",
        refId: id,
        note: data.reason,
        userId,
      },
    ]);
    return { name: item.name };
  });
}

/** Últimos ingresos a inventario (para la pantalla). */
export function listProductions(limit = 20) {
  return db.productionEntry.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

