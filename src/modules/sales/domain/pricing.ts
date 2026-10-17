import { type Cents, percentOf } from "@/core/money";
import type { SalesChannel } from "@/generated/prisma/enums";

export type ModifierSnapshot = { name: string; priceDeltaCents: Cents };

/**
 * Precio unitario que se cobra por un producto según el canal.
 *
 * - LOCAL: precio de lista + modificadores.
 * - PEYA:  (precio de lista + modificadores) + el % de recargo de PEYA,
 *          redondeado al centavo. Aplica a todo, bebidas incluidas.
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
  return base + percentOf(base, params.markupPercent);
}
