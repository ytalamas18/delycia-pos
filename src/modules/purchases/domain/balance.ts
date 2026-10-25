import type { Cents } from "@/core/money";

import type { PaymentStatus } from "./labels";

/** Saldo y estado de una compra según sus pagos vigentes (los anulados no cuentan). */
export function purchaseBalance(totalCents: Cents, payments: { amountCents: Cents; voidedAt: Date | null }[]) {
  const paidCents = payments.filter((p) => !p.voidedAt).reduce((s, p) => s + p.amountCents, 0);
  const balanceCents = totalCents - paidCents;
  const status: PaymentStatus = paidCents <= 0 ? "PENDING" : balanceCents <= 0 ? "PAID" : "PARTIAL";
  return { paidCents, balanceCents, status };
}

/** Vencida: queda saldo y el vencimiento ya pasó (fechas "YYYY-MM-DD"). */
export function isOverdue(dueDate: string | null, balanceCents: Cents, today: string): boolean {
  return balanceCents > 0 && dueDate !== null && dueDate < today;
}
