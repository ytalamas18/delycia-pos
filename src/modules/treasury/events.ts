/** Eventos que emite Caja y bancos (las pantallas de cierre se refrescan con ellos). */
declare module "@/core/events/types" {
  interface DomainEventMap {
    "cash.withdrawal_changed": { withdrawalId: string; businessDate: string; amountCents: number; voided: boolean };
  }
}

export {};
