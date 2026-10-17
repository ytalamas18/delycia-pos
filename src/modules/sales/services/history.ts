import { db } from "@/core/db/client";
import { DomainError } from "@/core/errors";
import { businessDayRange } from "@/core/time";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus, PaymentMethod, SalesChannel, ServiceType } from "@/generated/prisma/enums";

import { cashCount, summarizeDay, type DailySummary } from "../domain/closing";

export type HistoryFilters = {
  status?: OrderStatus;
  serviceType?: ServiceType;
  channel?: SalesChannel;
  method?: PaymentMethod;
};

/** Órdenes de un día de negocio, con filtros. La más reciente primero. */
export function listOrdersForDay(date: string, filters: HistoryFilters = {}) {
  const where: Prisma.OrderWhereInput = { businessDate: date };
  if (filters.status) where.status = filters.status;
  if (filters.serviceType) where.serviceType = filters.serviceType;
  if (filters.channel) where.channel = filters.channel;
  if (filters.method) where.payments = { some: { method: filters.method, refundedAt: null } };
  return db.order.findMany({
    where,
    include: { items: true, payments: true },
    orderBy: { number: "desc" },
  });
}

/** Detalle completo de una orden para el historial. */
export function getOrderDetail(id: string) {
  return db.order.findUnique({
    where: { id },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "asc" }, include: { collections: true } },
      statusLog: { orderBy: { at: "asc" } },
      createdBy: { select: { name: true } },
    },
  });
}

/** Resumen del día + cierre guardado (si ya se hizo). */
export async function getDailyClosing(date: string) {
  const { start, end } = businessDayRange(date);
  const [orders, collections, saved] = await Promise.all([
    db.order.findMany({ where: { businessDate: date }, include: { items: true, payments: true } }),
    db.creditCollection.findMany({ where: { createdAt: { gte: start, lt: end } } }),
    db.cashClosing.findUnique({ where: { businessDate: date } }),
  ]);
  const closedBy = saved ? await db.user.findUnique({ where: { id: saved.closedById }, select: { name: true } }) : null;
  return { summary: summarizeDay(orders, collections), saved, closedByName: closedBy?.name ?? null };
}

/** Guarda (o corrige) el cierre de caja del día con el arqueo de efectivo. */
export async function saveClosing(
  date: string,
  input: { openingCashCents: number; countedCashCents: number; notes?: string | null },
  userId: string,
) {
  for (const value of [input.openingCashCents, input.countedCashCents]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new DomainError("Los montos deben ser 0 o más.");
  }
  const { summary } = await getDailyClosing(date);
  const { expectedCashCents, differenceCents } = cashCount(summary, input.openingCashCents, input.countedCashCents);
  const data = {
    openingCashCents: input.openingCashCents,
    countedCashCents: input.countedCashCents,
    expectedCashCents,
    differenceCents,
    notes: input.notes?.trim() || null,
    summary: summary as unknown as Prisma.InputJsonValue,
    closedById: userId,
    closedAt: new Date(),
  };
  return db.cashClosing.upsert({ where: { businessDate: date }, create: { businessDate: date, ...data }, update: data });
}

export type { DailySummary };
