import { runInTransaction, type Tx } from "@/core/db/transaction";
import { DomainError } from "@/core/errors";
import { businessDate } from "@/core/time";

import { orderSubtotal } from "../domain/totals";

/** Quién anula y qué Admin lo autorizó (si anula un Admin, es él mismo). */
export type VoidActor = { userId: string; authorizedById: string };

function cleanReason(reason: string): string {
  const text = reason.trim();
  if (text.length < 3) throw new DomainError("Escribe el motivo de la anulación.", { reason: "Obligatorio" });
  if (text.length > 200) throw new DomainError("El motivo es muy largo (máximo 200 caracteres).", { reason: "Muy largo" });
  return text;
}

async function lockOrder(tx: Tx, orderId: string) {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true, payments: { include: { collections: true } } },
  });
  if (!order) throw new DomainError("La orden no existe");
  return order;
}

/**
 * Anula UN ítem de una orden por pagar. No se borra: queda VOIDED con motivo, usuario y hora,
 * y deja de sumar en el total. Una orden ya cobrada no se toca ítem por ítem: se anula entera.
 */
export async function voidItem(orderId: string, itemId: string, reason: string, actor: VoidActor) {
  const text = cleanReason(reason);
  return runInTransaction(async (tx, publish) => {
    const order = await lockOrder(tx, orderId);
    if (order.status !== "OPEN") {
      throw new DomainError("La orden ya fue cobrada o anulada: solo se puede anular la orden completa.");
    }
    const item = order.items.find((i) => i.id === itemId);
    if (!item || item.status !== "ACTIVE") throw new DomainError("El ítem no existe o ya está anulado.");

    await tx.orderItem.update({
      where: { id: itemId },
      data: {
        status: "VOIDED",
        voidReason: text,
        voidedAt: new Date(),
        voidedById: actor.userId,
        voidAuthorizedById: actor.authorizedById,
      },
    });
    const subtotalCents = orderSubtotal(order.items.map((i) => (i.id === itemId ? { ...i, status: "VOIDED" as const } : i)));
    await tx.order.update({
      where: { id: orderId },
      data: { subtotalCents, totalCents: Math.max(0, subtotalCents - order.discountCents) },
    });
    await publish("order.item_voided", {
      orderId,
      orderNumber: order.number,
      orderItemId: itemId,
      name: item.productName,
      quantity: item.quantity,
      reason: text,
      sentToKitchen: item.sentToKitchenAt !== null,
    });
  });
}

/**
 * Anula la orden completa. Por pagar: de cualquier día. Cobrada: solo el mismo día de negocio
 * (el dinero se devuelve hoy y el cierre de caja cuadra). Los pagos quedan como devueltos.
 * Un fiado que ya tiene abonos no se puede anular (descuadraría la caja).
 */
export async function cancelOrder(orderId: string, reason: string, actor: VoidActor, today = businessDate()) {
  const text = cleanReason(reason);
  return runInTransaction(async (tx, publish) => {
    const order = await lockOrder(tx, orderId);
    if (order.status === "CANCELLED") throw new DomainError("La orden ya está anulada.");
    const wasPaid = order.status === "PAID" || order.status === "CLOSED";
    if (wasPaid && order.businessDate !== today) {
      throw new DomainError("Una orden cobrada solo se puede anular el mismo día (su caja ya se cerró).");
    }
    if (order.payments.some((p) => p.method === "CREDIT" && p.collections.length > 0)) {
      throw new DomainError("Esta cuenta por cobrar ya tiene abonos: no se puede anular la orden.");
    }

    const now = new Date();
    const live = order.payments.filter((p) => !p.refundedAt);
    if (live.length > 0) {
      await tx.payment.updateMany({ where: { id: { in: live.map((p) => p.id) } }, data: { refundedAt: now } });
    }
    // Los totales se dejan como estaban: así se sabe cuánto se anuló.
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "CANCELLED",
        cancelledAt: now,
        cancelReason: text,
        cancelledById: actor.userId,
        cancelAuthorizedById: actor.authorizedById,
        statusLog: { create: { fromStatus: order.status, toStatus: "CANCELLED", reason: text, userId: actor.userId } },
      },
    });
    await publish("order.cancelled", {
      orderId,
      number: order.number,
      reason: text,
      wasPaid,
      refundedCents: live.filter((p) => p.method !== "CREDIT").reduce((s, p) => s + p.amountCents, 0),
    });
    return { number: order.number, wasPaid };
  });
}
