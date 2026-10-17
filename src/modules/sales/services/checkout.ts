import { db } from "@/core/db/client";
import { runInTransaction, type Publish, type Tx } from "@/core/db/transaction";
import { DomainError } from "@/core/errors";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { hasOpenTickets } from "@/modules/kitchen";

import { allowedPaymentMethods, discountCents, settle, type DiscountInput, type PaymentEntry } from "../domain/checkout";
import { paymentMethodLabel } from "../domain/labels";
import { orderSubtotal } from "../domain/totals";

export type PayOrderInput = {
  discount: DiscountInput;
  entries: PaymentEntry[];
  /** Obligatorio si hay CUENTA POR COBRAR: a nombre de quién queda la deuda. */
  customerName?: string | null;
};

/**
 * Cierra la orden si ya está pagada y cocina no tiene nada pendiente de ella.
 * Si estaba cerrada y cocina "deshizo" una entrega, vuelve a "pagada".
 */
export async function reconcileClosure(tx: Tx, publish: Publish, orderId: string) {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order || (order.status !== "PAID" && order.status !== "CLOSED")) return;

  const unsent = order.items.some((i) => i.status === "ACTIVE" && i.sendsToKitchen && !i.sentToKitchenAt);
  const done = !unsent && !(await hasOpenTickets(orderId, tx));

  if (order.status === "PAID" && done) {
    await tx.order.update({ where: { id: orderId }, data: { status: "CLOSED", closedAt: new Date() } });
    await tx.orderStatusLog.create({ data: { orderId, fromStatus: "PAID", toStatus: "CLOSED" } });
    await publish("order.closed", { orderId, number: order.number });
  } else if (order.status === "CLOSED" && !done) {
    await tx.order.update({ where: { id: orderId }, data: { status: "PAID", closedAt: null } });
    await tx.orderStatusLog.create({ data: { orderId, fromStatus: "CLOSED", toStatus: "PAID", reason: "Cocina deshizo una entrega" } });
  }
}

/**
 * Cobra una orden "por pagar": aplica el descuento, registra los pagos (con vuelto si es efectivo)
 * y la pasa a PAGADA. Si cocina ya entregó todo (o no había nada de cocina), queda CERRADA.
 */
export async function payOrder(orderId: string, input: PayOrderInput, userId: string) {
  return runInTransaction(async (tx, publish) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new DomainError("La orden no existe");
    if (order.status !== "OPEN") throw new DomainError("Esta orden ya fue cobrada o anulada.");

    const subtotal = orderSubtotal(order.items);
    if (subtotal <= 0) throw new DomainError("La orden no tiene productos para cobrar.");
    if (input.discount?.type === "PERCENT" && input.discount.value > 100) {
      throw new DomainError("El descuento no puede ser mayor a 100 %.");
    }
    const discount = discountCents(subtotal, input.discount);
    const total = subtotal - discount;

    const allowed = allowedPaymentMethods(order.channel);
    if (input.entries.some((e) => e.amountCents > 0 && !allowed.includes(e.method))) {
      throw new DomainError(
        order.channel === "PEYA"
          ? "Una orden PEYA solo se cobra con PEYA."
          : "PEYA solo se usa en órdenes hechas por el canal PEYA.",
      );
    }
    const result = settle(total, input.entries);
    if (!result.ok) throw new DomainError(result.error);

    const hasCredit = result.payments.some((p) => p.method === "CREDIT");
    const debtorName = (input.customerName ?? order.customerName ?? "").trim() || null;
    if (hasCredit && !debtorName) {
      throw new DomainError("Para dejar en cuenta por cobrar, escribe el nombre del cliente.");
    }

    const now = new Date();
    await tx.order.update({
      where: { id: orderId },
      data: {
        subtotalCents: subtotal,
        discountType: discount > 0 ? input.discount?.type : null,
        discountValue: discount > 0 ? input.discount?.value : null,
        discountCents: discount,
        totalCents: total,
        status: "PAID",
        paidAt: now,
        customerName: debtorName ?? order.customerName,
        statusLog: { create: { fromStatus: "OPEN", toStatus: "PAID", userId } },
        payments: {
          create: result.payments.map((p) => ({
            ...p,
            createdById: userId,
            debtorName: p.method === "CREDIT" ? debtorName : null,
          })),
        },
      },
    });

    await publish("order.paid", {
      orderId,
      number: order.number,
      totalCents: total,
      methods: result.payments.map((p) => p.method),
    });
    await reconcileClosure(tx, publish, orderId);
    return { number: order.number, totalCents: total, changeCents: result.changeCents };
  });
}

// ---------------------------------------------------------------------------
// Cuentas por cobrar (fiado)
// ---------------------------------------------------------------------------

export type Receivable = {
  paymentId: string;
  orderId: string;
  orderNumber: number;
  businessDate: string;
  debtorName: string;
  amountCents: number;
  collectedCents: number;
  balanceCents: number;
  createdAt: Date;
  settledAt: Date | null;
  collections: { method: PaymentMethod; amountCents: number; createdAt: Date }[];
};

function toReceivable(p: {
  id: string;
  orderId: string;
  amountCents: number;
  debtorName: string | null;
  createdAt: Date;
  settledAt: Date | null;
  order: { number: number; businessDate: string };
  collections: { method: PaymentMethod; amountCents: number; createdAt: Date }[];
}): Receivable {
  const collected = p.collections.reduce((s, c) => s + c.amountCents, 0);
  return {
    paymentId: p.id,
    orderId: p.orderId,
    orderNumber: p.order.number,
    businessDate: p.order.businessDate,
    debtorName: p.debtorName ?? "(sin nombre)",
    amountCents: p.amountCents,
    collectedCents: collected,
    balanceCents: p.amountCents - collected,
    createdAt: p.createdAt,
    settledAt: p.settledAt,
    collections: p.collections,
  };
}

const receivableInclude = {
  order: { select: { number: true, businessDate: true } },
  collections: { orderBy: { createdAt: "asc" as const }, select: { method: true, amountCents: true, createdAt: true } },
};

/** Deudas pendientes (de la más antigua a la más nueva). No incluye órdenes anuladas. */
export async function listOpenReceivables(): Promise<Receivable[]> {
  const rows = await db.payment.findMany({
    where: { method: "CREDIT", settledAt: null, refundedAt: null },
    include: receivableInclude,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toReceivable);
}

/** Deudas saldadas en los últimos `days` días (para ver quién pagó). */
export async function listSettledReceivables(days = 30): Promise<Receivable[]> {
  const rows = await db.payment.findMany({
    where: { method: "CREDIT", settledAt: { gte: new Date(Date.now() - days * 86_400_000) } },
    include: receivableInclude,
    orderBy: { settledAt: "desc" },
  });
  return rows.map(toReceivable);
}

const COLLECT_METHODS: PaymentMethod[] = ["CASH", "QR", "CARD"];

/** Registra que el cliente pagó (todo o una parte) de una cuenta por cobrar. */
export async function collectCredit(
  paymentId: string,
  input: { method: PaymentMethod; amountCents: number },
  userId: string,
) {
  if (!COLLECT_METHODS.includes(input.method)) {
    throw new DomainError("Una deuda se cobra en efectivo, QR o tarjeta.");
  }
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new DomainError("Ingresa un monto mayor a 0.");
  }
  return runInTransaction(async (tx, publish) => {
    await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${paymentId} FOR UPDATE`;
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { collections: true } });
    if (!payment || payment.method !== "CREDIT") throw new DomainError("La cuenta por cobrar no existe.");
    if (payment.settledAt) throw new DomainError("Esta cuenta ya está saldada.");
    if (payment.refundedAt) throw new DomainError("La orden de esta cuenta fue anulada.");

    const balance = payment.amountCents - payment.collections.reduce((s, c) => s + c.amountCents, 0);
    if (input.amountCents > balance) {
      throw new DomainError(`El monto supera lo que debe (${paymentMethodLabel.CREDIT.toLowerCase()} pendiente).`);
    }
    await tx.creditCollection.create({
      data: { paymentId, method: input.method, amountCents: input.amountCents, createdById: userId },
    });
    const settled = input.amountCents === balance;
    if (settled) await tx.payment.update({ where: { id: paymentId }, data: { settledAt: new Date() } });
    await publish("credit.collected", { paymentId, amountCents: input.amountCents, settled });
    return { settled, balanceCents: balance - input.amountCents };
  });
}
