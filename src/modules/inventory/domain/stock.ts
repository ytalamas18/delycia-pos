import { Decimal } from "@/core/quantity";

import type { StockLevel } from "./labels";

/** Nivel de stock: negativo, bajo el mínimo (incluye igual a 0 si hay mínimo) u OK. */
export function stockLevel(stock: Decimal, minStock: Decimal | null): StockLevel {
  if (stock.isNegative()) return "negative";
  if (minStock !== null && stock.lt(minStock)) return "low";
  return "ok";
}

/** Saldo acumulado de un kárdex (movimientos en orden). */
export function withRunningBalance<M extends { quantity: Decimal }>(movements: M[], opening: Decimal = new Decimal(0)) {
  let balance = opening;
  return movements.map((m) => {
    balance = balance.add(m.quantity);
    return { ...m, balance };
  });
}

/** Diferencia de un conteo: contado − teórico (negativo = merma). */
export function countDifference(expected: Decimal, counted: Decimal): Decimal {
  return counted.sub(expected);
}
