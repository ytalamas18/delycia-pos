import type {
  OrderStatus,
  PaymentMethod,
  SalesChannel,
  ServiceType,
} from "@/generated/prisma/enums";

// Textos visibles en la interfaz. Los valores internos quedan en inglés en la base.

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  CASH: "EFECTIVO",
  QR: "QR",
  CARD: "TARJETA",
  PEYA: "PEYA",
};

export const channelLabel: Record<SalesChannel, string> = {
  LOCAL: "Local",
  PEYA: "PEYA",
};

export const serviceTypeLabel: Record<ServiceType, string> = {
  DINE_IN: "Comer aquí",
  TAKEAWAY: "Para llevar",
};

export const orderStatusLabel: Record<OrderStatus, string> = {
  OPEN: "Abierta",
  PAID: "Pagada",
  CLOSED: "Cerrada",
  CANCELLED: "Anulada",
};
