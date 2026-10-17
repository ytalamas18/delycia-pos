import type { TicketStatus } from "@/generated/prisma/enums";

export const ticketStatusLabel: Record<TicketStatus, string> = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En preparación",
  READY: "Lista (entregada)",
  DELIVERED: "Entregada",
  CANCELLED: "Anulada",
};
