import type { SalesChannel, ServiceType } from "@/generated/prisma/enums";

/**
 * Eventos que emite Ventas. Cocina (u otros módulos) se suscriben a ellos;
 * nunca leen las tablas de ventas directamente.
 */
export type OrderItemSnapshot = {
  orderItemId: string;
  name: string;
  quantity: number;
  modifiers: string[];
  note: string | null;
  serviceType: ServiceType;
  sendsToKitchen: boolean;
};

declare module "@/core/events/types" {
  interface DomainEventMap {
    "order.created": {
      orderId: string;
      number: number;
      channel: SalesChannel;
      serviceType: ServiceType;
      tableNumber: string | null;
      customerName: string | null;
    };
    "order.item_added": { orderId: string; items: OrderItemSnapshot[] };
  }
}

export {};
