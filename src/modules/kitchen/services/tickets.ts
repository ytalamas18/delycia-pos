import { db } from "@/core/db/client";
import { runInTransaction, type Publish, type Tx } from "@/core/db/transaction";
import { DomainError } from "@/core/errors";
import type { Prisma } from "@/generated/prisma/client";
import type { TicketStatus } from "@/generated/prisma/enums";

import { ACTIVE_STATUSES, DONE_STATUSES, nextStatus, previousStatus, statusTimestamp } from "../domain/status";

const ticketInclude = {
  items: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.KitchenTicketInclude;

export type TicketWithItems = Prisma.KitchenTicketGetPayload<{ include: typeof ticketInclude }>;

/** Comandas en curso (pendientes y en preparación), de la más antigua a la más nueva. */
export function listActiveTickets() {
  return db.kitchenTicket.findMany({
    where: { status: { in: ACTIVE_STATUSES } },
    include: ticketInclude,
    orderBy: { receivedAt: "asc" },
  });
}

/** Listas (= entregadas) o anuladas en las últimas horas, para poder deshacer un toque por error. */
export function listRecentTickets(hours = 3) {
  return db.kitchenTicket.findMany({
    where: {
      status: { in: DONE_STATUSES },
      updatedAt: { gte: new Date(Date.now() - hours * 3600_000) },
    },
    include: ticketInclude,
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
}

/** Comandas de una orden con sus horas (para el detalle en el historial). */
export function listTicketsForOrder(orderId: string) {
  return db.kitchenTicket.findMany({ where: { orderId }, orderBy: { sequence: "asc" } });
}

export function getTicket(id: string) {
  return db.kitchenTicket.findUnique({ where: { id }, include: ticketInclude });
}

/** Resumen por orden para la lista de "Por pagar": ¿qué pasa en cocina con cada orden? */
export async function kitchenSummaryByOrder(orderIds: string[]) {
  const tickets = await db.kitchenTicket.findMany({
    where: { orderId: { in: orderIds }, status: { not: "CANCELLED" } },
    select: { orderId: true, status: true },
  });
  const summary = new Map<string, TicketStatus[]>();
  for (const t of tickets) summary.set(t.orderId, [...(summary.get(t.orderId) ?? []), t.status]);
  return summary;
}

/**
 * ¿Le queda a esta orden alguna comanda sin entregar? (Ventas lo usa para cerrar la orden.)
 * Acepta la transacción en curso para ver datos todavía no confirmados.
 */
export async function hasOpenTickets(orderId: string, client: Tx = db): Promise<boolean> {
  const open = await client.kitchenTicket.count({
    where: { orderId, status: { in: ACTIVE_STATUSES } },
  });
  return open > 0;
}

async function lockTicket(tx: Tx, ticketId: string) {
  await tx.$queryRaw`SELECT id FROM "KitchenTicket" WHERE id = ${ticketId} FOR UPDATE`;
  const ticket = await tx.kitchenTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new DomainError("La comanda no existe");
  return ticket;
}

async function moveTo(
  tx: Tx,
  publish: Publish,
  ticket: { id: string; orderId: string; orderNumber: number; label: string; sequence: number; status: TicketStatus },
  to: TicketStatus,
  userId: string | null,
  { undo = false } = {},
) {
  const now = new Date();
  const data: Prisma.KitchenTicketUpdateInput = { status: to };
  if (undo) {
    // Deshacer limpia la hora del estado que se abandona (así los tiempos quedan bien).
    const leaving = statusTimestamp[ticket.status as keyof typeof statusTimestamp];
    if (leaving) data[leaving] = null;
  } else {
    const entering = statusTimestamp[to as keyof typeof statusTimestamp];
    if (entering) data[entering] = now;
  }
  await tx.kitchenTicket.update({ where: { id: ticket.id }, data });
  await tx.ticketStatusLog.create({ data: { ticketId: ticket.id, fromStatus: ticket.status, toStatus: to, userId } });

  if (to === "READY" && !undo) {
    await tx.kitchenTicketItem.updateMany({ where: { ticketId: ticket.id, readyAt: null }, data: { readyAt: now } });
  }
  await publish("ticket.status_changed", { ticketId: ticket.id, orderId: ticket.orderId, from: ticket.status, to });
  if (to === "READY" && !undo) {
    await publish("ticket.ready", {
      ticketId: ticket.id,
      orderId: ticket.orderId,
      orderNumber: ticket.orderNumber,
      label: ticket.label,
      sequence: ticket.sequence,
    });
  }
}

/** Un toque: pendiente → en preparación → lista (= entregada). */
export function advanceTicket(ticketId: string, userId: string | null) {
  return runInTransaction(async (tx, publish) => {
    const ticket = await lockTicket(tx, ticketId);
    const to = nextStatus(ticket.status);
    if (!to) throw new DomainError("Esta comanda ya no se puede avanzar.");
    await moveTo(tx, publish, ticket, to, userId);
    return to;
  });
}

/** Deshacer: vuelve un paso atrás (ej. se marcó "lista" por error: vuelve a "En curso"). */
export function undoTicket(ticketId: string, userId: string | null) {
  return runInTransaction(async (tx, publish) => {
    const ticket = await lockTicket(tx, ticketId);
    const to = previousStatus(ticket.status);
    if (!to) throw new DomainError("No hay nada que deshacer en esta comanda.");
    await moveTo(tx, publish, ticket, to, userId, { undo: true });
    return to;
  });
}

/**
 * Marca o desmarca un ítem como listo. Si con eso quedan todos listos, la comanda pasa a "lista".
 * Marcar un ítem de una comanda pendiente la pone "en preparación".
 */
export function toggleItemReady(itemId: string, userId: string | null) {
  return runInTransaction(async (tx, publish) => {
    const item = await tx.kitchenTicketItem.findUnique({ where: { id: itemId } });
    if (!item) throw new DomainError("El ítem no existe");
    let ticket = await lockTicket(tx, item.ticketId);
    if (!["PENDING", "IN_PROGRESS"].includes(ticket.status)) {
      throw new DomainError("Solo se marcan ítems de comandas en curso.");
    }
    if (item.voidedAt) throw new DomainError("Ese ítem está anulado.");

    await tx.kitchenTicketItem.update({ where: { id: itemId }, data: { readyAt: item.readyAt ? null : new Date() } });

    if (ticket.status === "PENDING") {
      await moveTo(tx, publish, ticket, "IN_PROGRESS", userId);
      ticket = { ...ticket, status: "IN_PROGRESS" };
    }
    const remaining = await tx.kitchenTicketItem.count({
      where: { ticketId: ticket.id, readyAt: null, voidedAt: null },
    });
    if (remaining === 0) await moveTo(tx, publish, ticket, "READY", userId);
  });
}
