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
  CREDIT: "CUENTA POR COBRAR",
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
  OPEN: "Por pagar",
  PAID: "Pagada",
  CLOSED: "Cerrada",
  CANCELLED: "Anulada",
};

/** Cómo se identifica una orden en pantalla y en cocina: "Mesa 4 · Don Pedro", "Para llevar · Ana", "PEYA · Ana". */
export function orderLabel(order: {
  channel: SalesChannel;
  serviceType: ServiceType;
  tableNumber: string | null;
  customerName: string | null;
}): string {
  const head =
    order.channel === "PEYA"
      ? "PEYA"
      : order.serviceType === "DINE_IN"
        ? order.tableNumber
          ? `Mesa ${order.tableNumber}`
          : "Comer aquí"
        : "Para llevar";
  return order.customerName ? `${head} · ${order.customerName}` : head;
}
