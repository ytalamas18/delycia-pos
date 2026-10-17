import { eventBus } from "@/core/db/transaction";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Cocina reacciona a los eventos de Ventas. Corre DENTRO de la transacción de Ventas:
 * si no se puede crear la comanda, el envío a cocina se revierte entero.
 */
export function registerKitchenSubscribers() {
  eventBus.onTransaction("order.sent_to_kitchen", async ({ payload }, tx) => {
    const previous = await tx.kitchenTicket.count({ where: { orderId: payload.orderId } });
    await tx.kitchenTicket.create({
      data: {
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        sequence: previous + 1,
        channel: payload.channel,
        serviceType: payload.serviceType,
        label: payload.label,
        statusLog: { create: { toStatus: "PENDING" } },
        items: {
          create: payload.items.map((item) => ({
            orderItemId: item.orderItemId,
            name: item.name,
            quantity: item.quantity,
            modifiers: item.modifiers as Prisma.InputJsonValue,
            note: item.note,
            serviceType: item.serviceType,
          })),
        },
      },
    });
  });
}
