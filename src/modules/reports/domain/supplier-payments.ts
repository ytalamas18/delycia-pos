import type { MoneyAccount, SupplierPaymentMethod } from "@/generated/prisma/enums";

/** Lo mínimo de un pago a proveedor para sumar el reporte. */
export type PaymentForTotals = {
  amountCents: number;
  method: SupplierPaymentMethod;
  account: MoneyAccount;
  voidedAt: Date | null;
};

const METHODS: SupplierPaymentMethod[] = ["CASH", "TRANSFER", "CARD"];
const ACCOUNTS: MoneyAccount[] = ["CASH", "BANK", "ATC_PEYA"];

/** Valida los filtros de la URL (?metodo=&cuenta=); ignora valores inválidos. */
export function parseSupplierPaymentFilters(params: { metodo?: string; cuenta?: string }) {
  return {
    method: METHODS.includes(params.metodo as SupplierPaymentMethod) ? (params.metodo as SupplierPaymentMethod) : null,
    account: ACCOUNTS.includes(params.cuenta as MoneyAccount) ? (params.cuenta as MoneyAccount) : null,
  };
}

/** Separa vigentes y anulados y suma los vigentes por método y por cuenta. Los anulados no suman. */
export function summarizeSupplierPayments<T extends PaymentForTotals>(rows: T[]) {
  const active = rows.filter((r) => !r.voidedAt);
  const voided = rows.filter((r) => r.voidedAt);
  const byMethod = Object.fromEntries(METHODS.map((m) => [m, 0])) as Record<SupplierPaymentMethod, number>;
  const byAccount = Object.fromEntries(ACCOUNTS.map((a) => [a, 0])) as Record<MoneyAccount, number>;
  for (const r of active) {
    byMethod[r.method] += r.amountCents;
    byAccount[r.account] += r.amountCents;
  }
  return {
    active,
    voided,
    totalCents: active.reduce((s, r) => s + r.amountCents, 0),
    voidedCents: voided.reduce((s, r) => s + r.amountCents, 0),
    byMethod,
    byAccount,
  };
}

/** "Pan, Carne (Insumos)" → texto corto de ítems y categorías de la compra. */
export function itemsText(items: { name: string; category: string | null }[]): string {
  const categories = [...new Set(items.map((i) => i.category).filter(Boolean))];
  return `${items.map((i) => i.name).join(", ")}${categories.length ? ` (${categories.join(", ")})` : ""}`;
}
