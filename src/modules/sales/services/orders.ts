import { runInTransaction, type Publish, type Tx } from "@/core/db/transaction";
import { db } from "@/core/db/client";
import { DomainError } from "@/core/errors";
import { getSetting } from "@/core/settings";
import { businessDate } from "@/core/time";
import type { Prisma } from "@/generated/prisma/client";
import type { SalesChannel } from "@/generated/prisma/enums";
import { getSellableProduct } from "@/modules/catalog";

import { orderLabel } from "../domain/labels";
import type { ModifierSnapshot } from "../domain/pricing";
import { unitPriceFor } from "../domain/pricing";
import { orderSubtotal } from "../domain/totals";
import type { OrderItemSnapshot } from "../events";
import {
  draftLinesInput,
  itemUpdateInput,
  orderHeaderInput,
  type DraftLineInput,
  type ItemUpdateInput,
  type OrderHeaderInput,
} from "../schemas";
import { peyaMarkupSetting } from "../settings";

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

const orderInclude = {
  items: { orderBy: { createdAt: "asc" as const } },
  payments: true,
} satisfies Prisma.OrderInclude;

export type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function getOrder(id: string) {
  return db.order.findUnique({ where: { id }, include: orderInclude });
}

/** Pagadas que todavía no se cierran (cocina no terminó o falta enviarles algo). */
export function listPaidInProgress() {
  return db.order.findMany({
    where: { status: "PAID" },
    include: orderInclude,
    orderBy: { paidAt: "asc" },
  });
}

/** Órdenes "por pagar" (abiertas), de la más antigua a la más nueva. */
export function listOpenOrders() {
  return db.order.findMany({
    where: { status: "OPEN" },
    include: orderInclude,
    orderBy: { openedAt: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

type PricedLine = {
  productId: string;
  productName: string;
  listPriceCents: number;
  unitPriceCents: number;
  sendsToKitchen: boolean;
  modifiers: ModifierSnapshot[];
  quantity: number;
  note: string | null;
  serviceType: "DINE_IN" | "TAKEAWAY";
};

/**
 * Convierte lo que armó el cajero en líneas con precio, tomando nombre y precio
 * ACTUALES del catálogo (y copiándolos en la orden).
 */
async function priceLines(lines: DraftLineInput[], channel: SalesChannel, markupPercent: number) {
  const parsed = draftLinesInput.parse(lines);
  const priced: PricedLine[] = [];
  for (const line of parsed) {
    const product = await getSellableProduct(line.productId);
    if (!product) throw new DomainError("Uno de los productos ya no está disponible. Actualiza la pantalla.");
    const modifiers = line.modifierIds.map((id) => {
      const modifier = product.modifiers.find((m) => m.id === id);
      if (!modifier) throw new DomainError(`Un modificador de "${product.name}" ya no existe.`);
      return { name: modifier.name, priceDeltaCents: modifier.priceDeltaCents };
    });
    priced.push({
      productId: product.id,
      productName: product.name,
      listPriceCents: product.priceCents,
      unitPriceCents: unitPriceFor({ listPriceCents: product.priceCents, modifiers, channel, markupPercent }),
      sendsToKitchen: product.sendsToKitchen,
      modifiers,
      quantity: line.quantity,
      note: line.note || null,
      serviceType: line.serviceType,
    });
  }
  return priced;
}

async function nextOrderNumber(tx: Tx, date: string): Promise<number> {
  const counter = await tx.dailyCounter.upsert({
    where: { businessDate: date },
    create: { businessDate: date, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return counter.lastNumber;
}

async function recalcTotals(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  const subtotalCents = orderSubtotal(order.items);
  await tx.order.update({
    where: { id: orderId },
    data: { subtotalCents, totalCents: Math.max(0, subtotalCents - order.discountCents) },
  });
}

async function lockOpenOrder(tx: Tx, orderId: string) {
  // FOR UPDATE: dos cajas tocando la misma orden se atienden de a una.
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw new DomainError("La orden no existe");
  if (order.status !== "OPEN") {
    throw new DomainError("Esta orden ya fue pagada o anulada: no se puede modificar.");
  }
  return order;
}

function toSnapshot(item: { id: string } & PricedLine): OrderItemSnapshot {
  return {
    orderItemId: item.id,
    productId: item.productId,
    name: item.productName,
    quantity: item.quantity,
    modifiers: item.modifiers.map((m) => m.name),
    note: item.note,
    serviceType: item.serviceType,
    sendsToKitchen: item.sendsToKitchen,
  };
}

async function insertItems(tx: Tx, publish: Publish, orderId: string, lines: PricedLine[]) {
  const created = [];
  for (const line of lines) {
    const row = await tx.orderItem.create({
      data: { orderId, ...line, modifiers: line.modifiers as Prisma.InputJsonValue },
    });
    created.push({ ...line, id: row.id });
  }
  await publish("order.item_added", { orderId, items: created.map(toSnapshot) });
}

/** Crea una orden "por pagar" con sus ítems. Todavía NO se envía a cocina. */
export async function createOrder(header: OrderHeaderInput, lines: DraftLineInput[], userId: string) {
  const h = orderHeaderInput.parse(header);
  const markupPercent = h.channel === "PEYA" ? await getSetting(peyaMarkupSetting) : 0;
  const priced = await priceLines(lines, h.channel, markupPercent);

  return runInTransaction(async (tx, publish) => {
    const date = businessDate();
    const order = await tx.order.create({
      data: {
        businessDate: date,
        number: await nextOrderNumber(tx, date),
        channel: h.channel,
        channelMarkupPercent: markupPercent,
        serviceType: h.serviceType,
        tableNumber: h.tableNumber,
        customerName: h.customerName,
        createdById: userId,
        statusLog: { create: { toStatus: "OPEN", userId } },
      },
    });
    await publish("order.created", {
      orderId: order.id,
      number: order.number,
      channel: order.channel,
      serviceType: order.serviceType,
      tableNumber: order.tableNumber,
      customerName: order.customerName,
    });
    await insertItems(tx, publish, order.id, priced);
    await recalcTotals(tx, order.id);
    return order;
  });
}

/**
 * Agrega ítems a una orden por pagar (ej. la mesa pide otro plato).
 * Se cobran con el MISMO % de canal con que se abrió la orden.
 */
export async function addItems(orderId: string, lines: DraftLineInput[]) {
  const existing = await db.order.findUnique({ where: { id: orderId } });
  if (!existing) throw new DomainError("La orden no existe");
  const priced = await priceLines(lines, existing.channel, Number(existing.channelMarkupPercent));

  return runInTransaction(async (tx, publish) => {
    await lockOpenOrder(tx, orderId);
    await insertItems(tx, publish, orderId, priced);
    await recalcTotals(tx, orderId);
  });
}

/** Mesa, nombre del cliente y tipo (comer aquí / llevar) de la orden. */
export async function updateOrderInfo(
  orderId: string,
  info: Pick<OrderHeaderInput, "serviceType" | "tableNumber" | "customerName">,
) {
  return runInTransaction(async (tx) => {
    const order = await lockOpenOrder(tx, orderId);
    const h = orderHeaderInput.parse({ ...info, channel: order.channel });
    await tx.order.update({
      where: { id: orderId },
      data: { serviceType: h.serviceType, tableNumber: h.tableNumber, customerName: h.customerName },
    });
  });
}

async function unsentItem(tx: Tx, orderId: string, itemId: string) {
  const item = await tx.orderItem.findFirst({ where: { id: itemId, orderId } });
  if (!item || item.status !== "ACTIVE") throw new DomainError("El ítem no existe");
  if (item.sentToKitchenAt) {
    throw new DomainError("Este ítem ya se envió a cocina: para quitarlo hay que anularlo con un motivo.");
  }
  return item;
}

/** Cambia cantidad, nota o "para llevar" de un ítem que todavía no fue a cocina. */
export async function updateItem(orderId: string, itemId: string, input: ItemUpdateInput) {
  const data = itemUpdateInput.parse(input);
  return runInTransaction(async (tx) => {
    await lockOpenOrder(tx, orderId);
    await unsentItem(tx, orderId, itemId);
    await tx.orderItem.update({ where: { id: itemId }, data: { ...data, note: data.note || null } });
    await recalcTotals(tx, orderId);
  });
}

/**
 * Quita un ítem que todavía NO fue a cocina (equivale a borrarlo del carrito).
 * Lo ya enviado se anula con motivo (paso 7), nunca se borra.
 */
export async function removeItem(orderId: string, itemId: string) {
  return runInTransaction(async (tx) => {
    await lockOpenOrder(tx, orderId);
    await unsentItem(tx, orderId, itemId);
    await tx.orderItem.delete({ where: { id: itemId } });
    await recalcTotals(tx, orderId);
  });
}

/** Cuántos ítems de cocina faltan enviar (para decidir si "Enviar a cocina" tiene algo que mandar). */
export function countUnsentKitchenItems(orderId: string) {
  return db.orderItem.count({
    where: { orderId, status: "ACTIVE", sendsToKitchen: true, sentToKitchenAt: null },
  });
}

/**
 * Envía a cocina SOLO los ítems que van a cocina y todavía no se enviaron.
 * Se puede enviar estando "por pagar" o ya pagada (para llevar se cobra antes).
 * Cada envío genera una comanda; el segundo en adelante es una "adicional".
 */
export async function sendToKitchen(orderId: string) {
  return runInTransaction(async (tx, publish) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new DomainError("La orden no existe");
    if (order.status === "CANCELLED" || order.status === "CLOSED") {
      throw new DomainError("La orden está anulada o cerrada: no se puede enviar a cocina.");
    }

    const pending = order.items.filter((i) => i.status === "ACTIVE" && i.sendsToKitchen && !i.sentToKitchenAt);
    if (pending.length === 0) throw new DomainError("No hay platos nuevos para enviar a cocina.");

    const sentAt = new Date();
    await tx.orderItem.updateMany({ where: { id: { in: pending.map((i) => i.id) } }, data: { sentToKitchenAt: sentAt } });

    await publish("order.sent_to_kitchen", {
      orderId: order.id,
      orderNumber: order.number,
      channel: order.channel,
      serviceType: order.serviceType,
      label: orderLabel(order),
      items: pending.map((i) => ({
        orderItemId: i.id,
        productId: i.productId,
        name: i.productName,
        quantity: i.quantity,
        modifiers: (i.modifiers as { name: string }[]).map((m) => m.name),
        note: i.note,
        serviceType: i.serviceType,
        sendsToKitchen: true,
      })),
    });
    return { sentCount: pending.length };
  });
}
