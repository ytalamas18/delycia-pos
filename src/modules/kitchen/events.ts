import type { TicketStatus } from "@/generated/prisma/enums";

/** Eventos que emite Cocina. Ventas escucha `ticket.ready` para avisar al cajero. */
declare module "@/core/events/types" {
  interface DomainEventMap {
    "ticket.status_changed": { ticketId: string; orderId: string; from: TicketStatus; to: TicketStatus };
    "ticket.ready": { ticketId: string; orderId: string; orderNumber: number; label: string; sequence: number };
  }
}

export {};
