import type { Cents } from "@/core/money";

export type TotalsLine = { unitPriceCents: Cents; quantity: number; status: "ACTIVE" | "VOIDED" };

/** Subtotal de la orden: solo cuentan los ítems activos (los anulados quedan registrados pero no suman). */
export function orderSubtotal(lines: TotalsLine[]): Cents {
  return lines.filter((l) => l.status === "ACTIVE").reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
}
