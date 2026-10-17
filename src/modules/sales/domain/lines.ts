import type { Cents } from "@/core/money";
import type { ServiceType } from "@/generated/prisma/enums";

/** Una línea del pedido que todavía no se guardó (lo que el cajero va armando). */
export type DraftLine = {
  productId: string;
  quantity: number;
  modifierIds: string[];
  note: string;
  serviceType: ServiceType;
};

/**
 * Dos líneas son "la misma" si el producto, los modificadores, la nota y el tipo coinciden.
 * Así, tocar dos veces "Gaseosa" suma cantidad en vez de crear otra línea.
 */
export function lineKey(line: Omit<DraftLine, "quantity">): string {
  return [line.productId, [...line.modifierIds].sort().join(","), line.note.trim(), line.serviceType].join("|");
}

export function addDraftLine(lines: DraftLine[], line: DraftLine): DraftLine[] {
  const key = lineKey(line);
  const index = lines.findIndex((l) => lineKey(l) === key);
  if (index === -1) return [...lines, line];
  return lines.map((l, i) => (i === index ? { ...l, quantity: l.quantity + line.quantity } : l));
}

export function lineTotal(unitPriceCents: Cents, quantity: number): Cents {
  return unitPriceCents * quantity;
}
