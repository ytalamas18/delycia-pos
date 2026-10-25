import { formatQuantity } from "@/core/quantity";
import { formatUnitCostInput, listIngredients, listTrackedItems, recipeEstimate, UNIT_SHORT } from "@/modules/catalog";

import { stockByProduct } from "./stock";

/** Datos serializables para los formularios de inventario. */
export async function productionFormData() {
  const ingredients = await listIngredients();
  return Promise.all(
    ingredients.map(async (i) => {
      const estimate = (await recipeEstimate(i.id)) ?? i.lastCostCents;
      return { id: i.id, name: i.name, unit: UNIT_SHORT[i.baseUnit], estimate: estimate ? formatUnitCostInput(estimate) : "" };
    }),
  );
}

export async function countFormData() {
  const items = (await listTrackedItems()).filter((i) => i.active);
  const stock = await stockByProduct(items.map((i) => i.id));
  return items.map((i) => ({ id: i.id, name: i.name, unit: UNIT_SHORT[i.baseUnit], expected: formatQuantity(stock.get(i.id) ?? 0) }));
}

export async function consumptionFormData() {
  const items = (await listTrackedItems()).filter((i) => i.active);
  return items.map((i) => ({ id: i.id, name: i.name, unit: UNIT_SHORT[i.baseUnit] }));
}
