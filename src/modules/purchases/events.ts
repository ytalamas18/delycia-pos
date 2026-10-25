/**
 * Eventos que emite Compras. Inventario los escucha para sumar o revertir stock.
 * Los Decimal viajan como texto (el payload se guarda como JSON).
 */
declare module "@/core/events/types" {
  interface DomainEventMap {
    "purchase.registered": {
      purchaseId: string;
      number: number;
      date: string;
      lines: { lineId: string; productId: string; baseQuantity: string; unitCostCents: string; addsStock: boolean }[];
    };
    "purchase.cancelled": { purchaseId: string; number: number; reason: string };
    "supplier_payment.changed": { purchaseId: string; paymentId: string; voided: boolean };
  }
}

export {};
