import { db } from "@/core/db/client";
import { businessDayRange } from "@/core/time";
import { Prisma } from "@/generated/prisma/client";

import { buildProducts, type ProductRow, type ProductSort } from "../domain/products";
import type { DateRange } from "../domain/range";
import { buildVoidsReport, type VoidEntry } from "../domain/voids";
import { buildSalesByChannel, type ChannelDayRow, type DayRow } from "../domain/sales";

/*
 * Reportes = SOLO LECTURA. Es el único módulo que lee tablas de otro (Ventas y el catálogo),
 * y nunca escribe. Todo se suma en la base (GROUP BY) y los montos salen de lo guardado en
 * cada orden (snapshot), no de los precios actuales del catálogo.
 * Una venta cuenta en su día de negocio ("businessDate", ya calculado en hora de La Paz al abrirla).
 * Solo cuentan las órdenes cobradas (PAGADA o CERRADA); las anuladas van aparte.
 */

export async function getSalesByChannel(range: DateRange) {
  const [byChannel, byDay, cancelledByDay] = await Promise.all([
    // Pagos vigentes por día y medio. COUNT DISTINCT: una orden con dos pagos del mismo medio cuenta una vez.
    db.$queryRaw<ChannelDayRow[]>`
      SELECT o."businessDate" AS day, p.method::text AS channel,
             COUNT(DISTINCT o.id)::int AS orders, SUM(p."amountCents")::int AS "totalCents"
      FROM "Payment" p JOIN "Order" o ON o.id = p."orderId"
      WHERE o."businessDate" BETWEEN ${range.from} AND ${range.to}
        AND o.status IN ('PAID', 'CLOSED') AND p."refundedAt" IS NULL
      GROUP BY 1, 2`,
    db.$queryRaw<DayRow[]>`
      SELECT "businessDate" AS day, COUNT(*)::int AS orders, SUM("totalCents")::int AS "totalCents"
      FROM "Order"
      WHERE "businessDate" BETWEEN ${range.from} AND ${range.to} AND status IN ('PAID', 'CLOSED')
      GROUP BY 1`,
    db.$queryRaw<DayRow[]>`
      SELECT "businessDate" AS day, COUNT(*)::int AS orders, SUM("totalCents")::int AS "totalCents"
      FROM "Order"
      WHERE "businessDate" BETWEEN ${range.from} AND ${range.to} AND status = 'CANCELLED'
      GROUP BY 1`,
  ]);
  return buildSalesByChannel(range, { byChannel, byDay, cancelledByDay });
}

/**
 * Productos vendidos (ítems activos de órdenes cobradas) y anulados (ítems anulados de órdenes
 * cobradas + todo lo de órdenes anuladas). La categoría es la ACTUAL del producto.
 * Los montos son antes del descuento de la orden.
 */
export async function getProductsSold(range: DateRange, opts: { categoryId?: string | null; sort?: ProductSort } = {}) {
  const category = opts.categoryId || null;
  const productRows = (which: Prisma.Sql) => db.$queryRaw<ProductRow[]>`
    SELECT i."productId" AS "productId",
           (ARRAY_AGG(i."productName" ORDER BY i."createdAt" DESC))[1] AS name,
           MAX(c.name) AS category,
           SUM(i.quantity)::int AS quantity,
           SUM(i.quantity * i."unitPriceCents")::int AS "totalCents"
    FROM "OrderItem" i
    JOIN "Order" o ON o.id = i."orderId"
    LEFT JOIN "Product" pr ON pr.id = i."productId"
    LEFT JOIN "Category" c ON c.id = pr."categoryId"
    WHERE o."businessDate" BETWEEN ${range.from} AND ${range.to}
      AND (${category}::text IS NULL OR pr."categoryId" = ${category})
      AND ${which}
    GROUP BY i."productId"`;

  const [sold, voided] = await Promise.all([
    productRows(Prisma.sql`o.status IN ('PAID', 'CLOSED') AND i.status = 'ACTIVE'`),
    productRows(Prisma.sql`((o.status IN ('PAID', 'CLOSED') AND i.status = 'VOIDED') OR o.status = 'CANCELLED')`),
  ]);
  return buildProducts(sold, voided, opts.sort ?? "cantidad");
}

/** Categorías para el filtro del reporte de productos. */
export function listCategoriesForFilter() {
  return db.category.findMany({ select: { id: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

/**
 * Anulaciones hechas en el rango (por la HORA de la anulación, en días de La Paz): órdenes enteras
 * e ítems sueltos. El monto de una orden anulada ya no incluye los ítems que se anularon antes,
 * así que no se cuenta dos veces.
 */
export async function getVoids(range: DateRange) {
  const start = businessDayRange(range.from).start;
  const end = businessDayRange(range.to).end;
  const [orders, items] = await Promise.all([
    db.order.findMany({
      where: { status: "CANCELLED", cancelledAt: { gte: start, lt: end } },
      include: { items: true, payments: { select: { id: true } } },
    }),
    db.orderItem.findMany({
      where: { status: "VOIDED", voidedAt: { gte: start, lt: end } },
      include: { order: { select: { number: true, businessDate: true } } },
    }),
  ]);
  const userIds = [
    ...orders.flatMap((o) => [o.cancelledById, o.cancelAuthorizedById]),
    ...items.flatMap((i) => [i.voidedById, i.voidAuthorizedById]),
  ].filter((x): x is string => !!x);
  const users = await db.user.findMany({ where: { id: { in: [...new Set(userIds)] } }, select: { id: true, name: true } });
  const name = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? "—") : "—");
  const authorizer = (by: string | null, auth: string | null) => (auth && auth !== by ? name(auth) : null);

  const entries: VoidEntry[] = [
    ...orders.map((o) => {
      const active = o.items.filter((i) => i.status === "ACTIVE");
      return {
        kind: "order" as const,
        at: o.cancelledAt!,
        orderId: o.id,
        orderNumber: o.number,
        orderDate: o.businessDate,
        products: active.map((i) => `${i.quantity}× ${i.productName}`).join(", "),
        amountCents: o.totalCents,
        reason: o.cancelReason ?? "",
        voidedBy: name(o.cancelledById),
        authorizedBy: authorizer(o.cancelledById, o.cancelAuthorizedById),
        inKitchen: active.some((i) => i.sentToKitchenAt !== null),
        wasPaid: o.payments.length > 0,
      };
    }),
    ...items.map((i) => ({
      kind: "item" as const,
      at: i.voidedAt!,
      orderId: i.orderId,
      orderNumber: i.order.number,
      orderDate: i.order.businessDate,
      products: `${i.quantity}× ${i.productName}`,
      amountCents: i.unitPriceCents * i.quantity,
      reason: i.voidReason ?? "",
      voidedBy: name(i.voidedById),
      authorizedBy: authorizer(i.voidedById, i.voidAuthorizedById),
      inKitchen: i.sentToKitchenAt !== null,
      // Un ítem solo se anula en una orden por pagar.
      wasPaid: false,
    })),
  ];
  return buildVoidsReport(entries);
}
