import { db } from "@/core/db/client";
import type { Tx } from "@/core/db/transaction";
import type { Decimal } from "@/core/quantity";
import type { ServiceType } from "@/generated/prisma/enums";

import { stockConsumption } from "../domain/recipes";
import { textKey } from "../domain/text";
import { unitCosts } from "./recipes";

export type SoldLine = {
  /** Identificador de la línea vendida (ej. orderItemId): se devuelve tal cual. */
  lineId: string;
  productId: string;
  quantity: number;
  serviceType: ServiceType;
  /** Nombres de los modificadores elegidos (la orden guarda solo el nombre). */
  modifiers: string[];
};

export type ConsumptionLine = { lineId: string; componentId: string; quantity: Decimal; unitCostCents: Decimal | null };

/**
 * Qué componentes (con stock) descuenta cada línea vendida: receta del Preparado (según para llevar /
 * comer aquí), el propio ítem si es Normal con stock, y lo que descuentan sus modificadores.
 * Lo usa Inventario dentro de la transacción de la venta.
 */
export async function resolveConsumption(lines: SoldLine[], client: Tx = db): Promise<ConsumptionLine[]> {
  if (lines.length === 0) return [];
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const products = await client.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      type: true,
      tracksStock: true,
      recipeLines: { select: { componentId: true, quantity: true, condition: true, component: { select: { tracksStock: true } } } },
      modifiers: {
        select: { name: true, recipeLines: { select: { componentId: true, quantity: true, component: { select: { tracksStock: true } } } } },
      },
    },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: ConsumptionLine[] = [];
  for (const line of lines) {
    const p = byId.get(line.productId);
    if (!p) continue; // producto borrado: no se descuenta nada
    const chosen = new Set(line.modifiers.map(textKey));
    const modifierLines = p.modifiers
      .filter((m) => chosen.has(textKey(m.name)))
      .flatMap((m) => m.recipeLines.map((r) => ({ componentId: r.componentId, quantity: r.quantity, tracksStock: r.component.tracksStock })));
    const consumed = stockConsumption({
      productId: p.id,
      type: p.type,
      tracksStock: p.tracksStock,
      quantity: line.quantity,
      serviceType: line.serviceType,
      recipe: p.recipeLines.map((r) => ({ componentId: r.componentId, quantity: r.quantity, condition: r.condition, tracksStock: r.component.tracksStock })),
      modifierLines,
    });
    for (const c of consumed) out.push({ lineId: line.lineId, componentId: c.componentId, quantity: c.quantity, unitCostCents: null });
  }
  const costs = await unitCosts([...new Set(out.map((o) => o.componentId))]);
  return out.map((o) => ({ ...o, unitCostCents: costs.get(o.componentId) ?? null }));
}
