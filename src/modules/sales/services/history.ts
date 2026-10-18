import { db } from "@/core/db/client";
import { DomainError, isUniqueViolation } from "@/core/errors";
import { businessDayRange } from "@/core/time";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus, PaymentMethod, SalesChannel, ServiceType } from "@/generated/prisma/enums";

import { arqueo, summarizeDay, type DailySummary } from "../domain/closing";

export type HistoryFilters = {
  status?: OrderStatus;
  serviceType?: ServiceType;
  channel?: SalesChannel;
  method?: PaymentMethod;
};

/** Filtros del historial tal como vienen en la URL (?estado=&tipo=&canal=&metodo=). Ignora valores inválidos. */
export type HistoryParams = { estado?: string; tipo?: string; canal?: string; metodo?: string };

export function parseHistoryFilters(params: HistoryParams): HistoryFilters {
  const pick = <T extends string>(value: string | undefined, allowed: readonly T[]) =>
    allowed.includes(value as T) ? (value as T) : undefined;
  return {
    status: pick(params.estado, ["OPEN", "PAID", "CLOSED", "CANCELLED"] as const),
    serviceType: pick(params.tipo, ["DINE_IN", "TAKEAWAY"] as const),
    channel: pick(params.canal, ["LOCAL", "PEYA"] as const),
    method: pick(params.metodo, ["CASH", "QR", "CARD", "PEYA", "CREDIT"] as const),
  };
}

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

/** Detalle completo de una orden para el historial (con los nombres de quién anuló y autorizó). */
export async function getOrderDetail(id: string) {
  const order = await db.order.findUnique({
    where: { id },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "asc" }, include: { collections: true } },
      statusLog: { orderBy: { at: "asc" } },
      createdBy: { select: { name: true } },
    },
  });
  if (!order) return null;
  const ids = [
    order.cancelledById,
    order.cancelAuthorizedById,
    ...order.items.flatMap((i) => [i.voidedById, i.voidAuthorizedById]),
  ].filter((x): x is string => !!x);
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return { ...order, userName: (id: string | null) => (id ? (names.get(id) ?? "—") : null) };
}

// ---------------------------------------------------------------------------
// Apertura de caja
// ---------------------------------------------------------------------------

export async function getOpening(date: string) {
  const opening = await db.cashOpening.findUnique({ where: { businessDate: date } });
  if (!opening) return null;
  const by = await db.user.findUnique({ where: { id: opening.openedById }, select: { name: true } });
  return { ...opening, openedByName: by?.name ?? null };
}

/**
 * Registra el efectivo con el que empieza el día. Es de UNA sola vez: una vez abierta,
 * la caja no se puede volver a abrir ni cambiar el monto.
 */
export async function openCash(date: string, input: { openingCashCents: number; notes?: string | null }, userId: string) {
  if (!Number.isSafeInteger(input.openingCashCents) || input.openingCashCents < 0) {
    throw new DomainError("El monto inicial debe ser 0 o más.");
  }
  const existing = await db.cashOpening.findUnique({ where: { businessDate: date } });
  if (existing) throw new DomainError("La caja de este día ya se abrió; el monto inicial no se puede cambiar.");
  try {
    return await db.cashOpening.create({
      data: { businessDate: date, openingCashCents: input.openingCashCents, notes: input.notes?.trim() || null, openedById: userId },
    });
  } catch (error) {
    // Dos cajas abriendo a la vez: gana la primera.
    if (isUniqueViolation(error)) throw new DomainError("La caja de este día ya se abrió.");
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Cierre de caja
// ---------------------------------------------------------------------------

/** Resumen del día + apertura + cierre guardado (si ya se hizo). */
export async function getDailyClosing(date: string) {
  const { start, end } = businessDayRange(date);
  const [orders, collections, saved, opening] = await Promise.all([
    db.order.findMany({ where: { businessDate: date }, include: { items: true, payments: true } }),
    db.creditCollection.findMany({ where: { createdAt: { gte: start, lt: end } } }),
    db.cashClosing.findUnique({ where: { businessDate: date } }),
    getOpening(date),
  ]);
  const closedBy = saved ? await db.user.findUnique({ where: { id: saved.closedById }, select: { name: true } }) : null;

  // Categoría actual de cada producto vendido (para agrupar el reporte de productos).
  const productIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.productId)))];
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, category: { select: { name: true, sortOrder: true } } },
  });
  const categoryOf = new Map(products.map((p) => [p.id, p.category]));
  const withCategory = orders.map((o) => ({
    ...o,
    items: o.items.map((i) => ({ ...i, category: categoryOf.get(i.productId) ?? null })),
  }));

  return { summary: summarizeDay(withCategory, collections), saved, closedByName: closedBy?.name ?? null, opening };
}

/** Guarda (o corrige) el cierre de caja del día con el arqueo de efectivo. */
export async function saveClosing(
  date: string,
  input: {
    countedCashCents: number;
    countedQrCents?: number | null;
    countedCardCents?: number | null;
    notes?: string | null;
  },
  userId: string,
) {
  const { summary, opening } = await getDailyClosing(date);
  const counted = {
    // El fondo inicial sale de la apertura de caja del día (0 si no se abrió).
    openingCashCents: opening?.openingCashCents ?? 0,
    countedCashCents: input.countedCashCents,
    countedQrCents: input.countedQrCents ?? null,
    countedCardCents: input.countedCardCents ?? null,
  };
  for (const value of Object.values(counted)) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new DomainError("Los montos deben ser 0 o más.");
  }
  const result = arqueo(summary, counted);
  const data = {
    ...counted,
    expectedCashCents: result.cash.expectedCents,
    differenceCents: result.cash.differenceCents ?? 0,
    expectedQrCents: result.qr.expectedCents,
    expectedCardCents: result.card.expectedCents,
    notes: input.notes?.trim() || null,
    summary: summary as unknown as Prisma.InputJsonValue,
    closedById: userId,
    closedAt: new Date(),
  };
  return db.cashClosing.upsert({ where: { businessDate: date }, create: { businessDate: date, ...data }, update: data });
}

export type { DailySummary };
