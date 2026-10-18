import type { Cents } from "@/core/money";

/** Una anulación: una orden entera o un ítem suelto. */
export type VoidEntry = {
  kind: "order" | "item";
  at: Date;
  orderId: string;
  orderNumber: number;
  /** Día de negocio de la orden (puede ser anterior al de la anulación si estaba por pagar). */
  orderDate: string;
  products: string;
  amountCents: Cents;
  reason: string;
  voidedBy: string;
  /** Admin que autorizó (null si anuló el mismo Admin). */
  authorizedBy: string | null;
  inKitchen: boolean;
  wasPaid: boolean;
};

export type ReasonGroup = { reason: string; count: number; amountCents: Cents };

export type VoidsReport = {
  entries: VoidEntry[];
  totals: { count: number; orders: number; items: number; amountCents: Cents };
  byReason: ReasonGroup[];
};

/** "  Cliente se FUE " y "cliente se fue" son el mismo motivo. */
export const reasonKey = (reason: string) =>
  reason
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.!]+$/, "");

export function buildVoidsReport(entries: VoidEntry[]): VoidsReport {
  const sorted = [...entries].sort((a, b) => a.at.getTime() - b.at.getTime());
  const groups = new Map<string, ReasonGroup>();
  for (const e of sorted) {
    const key = reasonKey(e.reason);
    const g = groups.get(key) ?? { reason: e.reason.trim(), count: 0, amountCents: 0 };
    g.count += 1;
    g.amountCents += e.amountCents;
    groups.set(key, g);
  }
  return {
    entries: sorted,
    totals: {
      count: sorted.length,
      orders: sorted.filter((e) => e.kind === "order").length,
      items: sorted.filter((e) => e.kind === "item").length,
      amountCents: sorted.reduce((s, e) => s + e.amountCents, 0),
    },
    byReason: [...groups.values()].sort((a, b) => b.count - a.count || b.amountCents - a.amountCents || a.reason.localeCompare(b.reason)),
  };
}
