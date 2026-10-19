import { Decimal, type DecimalValue, roundQuantity } from "@/core/quantity";

import { BASE_UNITS, type BaseUnit, UNIT_LABEL } from "./unit-labels";

export { BASE_UNITS, type BaseUnit, UNIT_LABEL, UNIT_SHORT } from "./unit-labels";

/** Cuánto vale 1 de cada unidad en la unidad de referencia de su familia (g, ml o unidad). */
const FAMILY: Record<BaseUnit, { family: "mass" | "volume" | "count"; inRef: number }> = {
  UNIT: { family: "count", inRef: 1 },
  KG: { family: "mass", inRef: 1000 },
  G: { family: "mass", inRef: 1 },
  L: { family: "volume", inRef: 1000 },
  ML: { family: "volume", inRef: 1 },
};

/** Unidades en las que se puede comprar/contar un ítem con esta unidad base (kg ↔ g, litro ↔ ml). */
export function compatibleUnits(base: BaseUnit): BaseUnit[] {
  return BASE_UNITS.filter((u) => FAMILY[u].family === FAMILY[base].family);
}

/** Factor para pasar de `from` a `to` (ej. KG → G = 1000). Error si son de familias distintas. */
export function unitFactor(from: BaseUnit, to: BaseUnit): Decimal {
  if (FAMILY[from].family !== FAMILY[to].family) {
    throw new Error(`No se puede convertir ${UNIT_LABEL[from]} a ${UNIT_LABEL[to]}`);
  }
  return new Decimal(FAMILY[from].inRef).div(FAMILY[to].inRef);
}

/**
 * Cantidad comprada/contada → unidad base del ítem.
 * - Con presentación: cantidad × factor (2 "Bolsa x12" = 24).
 * - Con unidad: cantidad × factor de la unidad (1,5 kg en un ítem en g = 1500).
 */
export function toBaseQuantity(
  quantity: DecimalValue,
  base: BaseUnit,
  from: { presentationFactor: DecimalValue } | { unit: BaseUnit },
): Decimal {
  const factor = "presentationFactor" in from ? new Decimal(from.presentationFactor) : unitFactor(from.unit, base);
  return roundQuantity(new Decimal(quantity).mul(factor));
}
