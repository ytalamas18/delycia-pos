import { Decimal, roundQuantity } from "@/core/quantity";
import type { ItemType, RecipeCondition, ServiceType } from "@/generated/prisma/enums";

/** Si una línea de receta aplica a un ítem servido así (PEYA llega siempre como para llevar). */
export function appliesTo(condition: RecipeCondition, serviceType: ServiceType): boolean {
  return condition === "ALWAYS" || condition === serviceType;
}

// ---------------------------------------------------------------------------
// Costos
// ---------------------------------------------------------------------------

/** Línea con el costo por unidad base de su componente (null = sin costo cargado). */
export type CostedLine = { quantity: Decimal; unitCostCents: Decimal | null; condition?: RecipeCondition };

export type CostResult = {
  /** Costo en centavos (con decimales; se redondea solo al mostrar). Las líneas sin costo suman 0. */
  costCents: Decimal;
  /** Cuántas líneas no tienen costo: si es > 0, el costo está incompleto. */
  missing: number;
};

/** Costo de un plato servido de cierta forma (cuenta solo las líneas que aplican). */
export function recipeCost(lines: CostedLine[], serviceType: ServiceType): CostResult {
  let costCents = new Decimal(0);
  let missing = 0;
  for (const line of lines) {
    if (!appliesTo(line.condition ?? "ALWAYS", serviceType)) continue;
    if (line.unitCostCents === null) missing++;
    else costCents = costCents.add(line.quantity.mul(line.unitCostCents));
  }
  return { costCents, missing };
}

/** Costo por unidad base de un Ingrediente según su receta de referencia: costo total ÷ rendimiento. */
export function ingredientUnitCost(lines: CostedLine[], recipeYield: Decimal | null): CostResult & { unitCostCents: Decimal | null } {
  const total = recipeCost(lines, "DINE_IN");
  if (!recipeYield || recipeYield.lte(0) || lines.length === 0) return { ...total, unitCostCents: null };
  return { ...total, unitCostCents: total.costCents.div(recipeYield) };
}

/** Margen frente al precio de venta: monto y % sobre el precio. */
export function margin(priceCents: number, costCents: Decimal) {
  const marginCents = new Decimal(priceCents).sub(costCents);
  const percent = priceCents > 0 ? marginCents.div(priceCents).mul(100).toDecimalPlaces(1).toNumber() : null;
  return { marginCents, percent };
}

// ---------------------------------------------------------------------------
// Consumo de stock al vender (lo usa Inventario)
// ---------------------------------------------------------------------------

export type StockLine = { componentId: string; quantity: Decimal; tracksStock: boolean; condition?: RecipeCondition };

export type SoldItem = {
  productId: string;
  type: ItemType;
  tracksStock: boolean;
  /** Unidades vendidas. */
  quantity: number;
  serviceType: ServiceType;
  recipe: StockLine[];
  /** Líneas de los modificadores elegidos (por unidad del ítem). */
  modifierLines: StockLine[];
};

/**
 * Qué componentes descuenta del stock un ítem vendido, ya sumados por componente.
 * - Normal con stock: se descuenta a sí mismo.
 * - Preparado: las líneas de su receta que aplican (según para llevar / comer aquí).
 * - Más lo que descuenten sus modificadores.
 * Se ignoran los componentes que no manejan stock. Sin receta → no descuenta nada (se vende igual).
 */
export function stockConsumption(item: SoldItem): { componentId: string; quantity: Decimal }[] {
  const lines: StockLine[] = [...item.modifierLines];
  if (item.type === "PREPARED") lines.push(...item.recipe);
  else if (item.tracksStock) lines.push({ componentId: item.productId, quantity: new Decimal(1), tracksStock: true });

  const totals = new Map<string, Decimal>();
  for (const line of lines) {
    if (!line.tracksStock || !appliesTo(line.condition ?? "ALWAYS", item.serviceType)) continue;
    const qty = line.quantity.mul(item.quantity);
    totals.set(line.componentId, (totals.get(line.componentId) ?? new Decimal(0)).add(qty));
  }
  return [...totals].map(([componentId, quantity]) => ({ componentId, quantity: roundQuantity(quantity) }));
}
