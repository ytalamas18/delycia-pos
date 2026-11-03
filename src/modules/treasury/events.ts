/** Eventos que emite Caja y bancos (las pantallas de cierre se refrescan con ellos). */
declare module "@/core/events/types" {
  interface DomainEventMap {
    "cash.withdrawal_changed": { withdrawalId: string; businessDate: string; amountCents: number; voided: boolean };
    "account_transfer.changed": { transferId: string; date: string; fromAccount: string; toAccount: string; voided: boolean };
    "bank_deposit.changed": { depositId: string; date: string; voided: boolean };
    "account_opening.changed": { openingId: string; account: string; voided: boolean };
  }
}

export {};
