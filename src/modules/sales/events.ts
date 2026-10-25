import type { SalesChannel, ServiceType } from "@/generated/prisma/enums";

/**
 * Eventos que emite Ventas. Cocina (u otros módulos) se suscriben a ellos;
 * nunca leen las tablas de ventas directamente.
 */
export type OrderItemSnapshot = {
  orderItemId: string;
  /** Producto del catálogo (Inventario lo usa para descontar stock según su receta). */
  productId: string;
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
    /** `items`: todos los ítems activos de la orden (Inventario descuenta los que aún no descontó). */
    "order.paid": {
      orderId: string;
      number: number;
      totalCents: number;
      methods: string[];
      channel: SalesChannel;
      items: OrderItemSnapshot[];
    };
    "order.closed": { orderId: string; number: number };
    /** Ítem anulado (con motivo). Si ya estaba en cocina, Cocina lo marca ANULADO en su comanda. */
    "order.item_voided": {
      orderId: string;
      orderNumber: number;
      orderItemId: string;
      name: string;
      quantity: number;
      reason: string;
      sentToKitchen: boolean;
    };
    /** Orden anulada entera. `refundedCents` = lo que se devolvió si ya estaba cobrada. */
    "order.cancelled": { orderId: string; number: number; reason: string; wasPaid: boolean; refundedCents: number };
    "credit.collected": { paymentId: string; amountCents: number; settled: boolean };
    /** Solo trae los ítems NUEVOS que van a cocina. Cocina crea una comanda con ellos. */
    "order.sent_to_kitchen": {
      orderId: string;
      orderNumber: number;
      channel: SalesChannel;
      serviceType: ServiceType;
      /** "Mesa 4 · Don Pedro", "Para llevar · Ana", "PEYA · Ana" */
      label: string;
      items: OrderItemSnapshot[];
    };
  }
}

export {};
