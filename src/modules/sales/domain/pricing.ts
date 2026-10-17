import { type Cents, percentOf, roundTo, WHOLE_UNIT } from "@/core/money";
import type { SalesChannel } from "@/generated/prisma/enums";

export type ModifierSnapshot = { name: string; priceDeltaCents: Cents };

/**
 * Precio unitario que se cobra por un producto según el canal.
 *
 * - LOCAL: precio de lista + modificadores.
 * - PEYA:  (precio de lista + modificadores) + el % de recargo de PEYA,
 *          redondeado al boliviano entero (53,20 → 53; 53,50 → 54).
 *          Aplica a todo, bebidas incluidas.
 */
export function unitPriceFor(params: {
  listPriceCents: Cents;
  modifiers?: ModifierSnapshot[];
  channel: SalesChannel;
  markupPercent: number;
}): Cents {
  const base =
    params.listPriceCents + (params.modifiers ?? []).reduce((sum, m) => sum + m.priceDeltaCents, 0);
  if (params.channel !== "PEYA") return base;
  return roundTo(base + percentOf(base, params.markupPercent), WHOLE_UNIT);
}
