import type { Cents } from "@/core/money";
import type { OrderStatus, PaymentMethod, SalesChannel } from "@/generated/prisma/enums";

export type ClosingOrder = {
  status: OrderStatus;
  channel: SalesChannel;
  subtotalCents: Cents;
  discountCents: Cents;
  totalCents: Cents;
  items: { productName: string; quantity: number; unitPriceCents: Cents; status: "ACTIVE" | "VOIDED" }[];
  payments: { method: PaymentMethod; amountCents: Cents; refundedAt: Date | null }[];
};

export type ClosingCollection = { method: PaymentMethod; amountCents: Cents };

const METHODS: PaymentMethod[] = ["CASH", "QR", "CARD", "PEYA", "CREDIT"];
const zeroByMethod = () => Object.fromEntries(METHODS.map((m) => [m, 0])) as Record<PaymentMethod, Cents>;

export type DailySummary = {
  /** Órdenes cobradas (pagadas o cerradas). */
  paidCount: number;
  openCount: number;
  openTotalCents: Cents;
  cancelledCount: number;
  grossCents: Cents;
  discountCents: Cents;
  netCents: Cents;
  averageTicketCents: Cents;
  /** Ventas del día por método (CREDIT = lo que quedó fiado hoy). */
  salesByMethod: Record<PaymentMethod, Cents>;
  byChannel: Record<SalesChannel, { count: number; netCents: Cents }>;
  /** Cobros de fiados (de cualquier día) recibidos hoy. */
  collectionsByMethod: Record<PaymentMethod, Cents>;
  collectionsTotalCents: Cents;
  /** Dinero que entró hoy por cada medio: ventas + cobros de fiados. */
  moneyInByMethod: Record<PaymentMethod, Cents>;
  products: { name: string; quantity: number; amountCents: Cents }[];
};

/**
 * Resumen del día para el cierre de caja. Solo cuentan como venta las órdenes cobradas;
 * las anuladas y las que siguen por pagar se informan aparte.
 */
export function summarizeDay(orders: ClosingOrder[], collections: ClosingCollection[]): DailySummary {
  const paid = orders.filter((o) => o.status === "PAID" || o.status === "CLOSED");
  const open = orders.filter((o) => o.status === "OPEN");

  const salesByMethod = zeroByMethod();
  for (const o of paid) {
    for (const p of o.payments) if (!p.refundedAt) salesByMethod[p.method] += p.amountCents;
  }
  const collectionsByMethod = zeroByMethod();
  for (const c of collections) collectionsByMethod[c.method] += c.amountCents;

  const moneyInByMethod = zeroByMethod();
  for (const m of METHODS) {
    // Lo fiado hoy no es dinero que entró.
    moneyInByMethod[m] = (m === "CREDIT" ? 0 : salesByMethod[m]) + collectionsByMethod[m];
  }

  const byChannel: DailySummary["byChannel"] = { LOCAL: { count: 0, netCents: 0 }, PEYA: { count: 0, netCents: 0 } };
  for (const o of paid) {
    byChannel[o.channel].count += 1;
    byChannel[o.channel].netCents += o.totalCents;
  }

  const productMap = new Map<string, { name: string; quantity: number; amountCents: Cents }>();
  for (const o of paid) {
    for (const i of o.items) {
      if (i.status !== "ACTIVE") continue;
      const p = productMap.get(i.productName) ?? { name: i.productName, quantity: 0, amountCents: 0 };
      p.quantity += i.quantity;
      p.amountCents += i.unitPriceCents * i.quantity;
      productMap.set(i.productName, p);
    }
  }

  const netCents = paid.reduce((s, o) => s + o.totalCents, 0);
  return {
    paidCount: paid.length,
    openCount: open.length,
    openTotalCents: open.reduce((s, o) => s + o.totalCents, 0),
    cancelledCount: orders.filter((o) => o.status === "CANCELLED").length,
    grossCents: paid.reduce((s, o) => s + o.subtotalCents, 0),
    discountCents: paid.reduce((s, o) => s + o.discountCents, 0),
    netCents,
    averageTicketCents: paid.length ? Math.round(netCents / paid.length) : 0,
    salesByMethod,
    byChannel,
    collectionsByMethod,
    collectionsTotalCents: collections.reduce((s, c) => s + c.amountCents, 0),
    moneyInByMethod,
    products: [...productMap.values()].sort((a, b) => b.quantity - a.quantity || b.amountCents - a.amountCents),
  };
}

/** Efectivo que debería haber en caja y diferencia con lo contado. */
export function cashCount(summary: DailySummary, openingCashCents: Cents, countedCashCents: Cents) {
  const expectedCashCents = openingCashCents + summary.moneyInByMethod.CASH;
  return { expectedCashCents, differenceCents: countedCashCents - expectedCashCents };
}

export type ArqueoInput = {
  openingCashCents: Cents;
  countedCashCents: Cents;
  /** null = no se revisó ese medio. */
  countedQrCents: Cents | null;
  countedCardCents: Cents | null;
};

export type ArqueoLine = { expectedCents: Cents; countedCents: Cents | null; differenceCents: Cents | null };

/**
 * Arqueo completo: efectivo (con fondo inicial), QR (vs. app del banco) y tarjeta (vs. datáfono).
 * PEYA y cuentas por cobrar no se cuentan: no es dinero que esté en el local.
 */
export function arqueo(summary: DailySummary, input: ArqueoInput): { cash: ArqueoLine; qr: ArqueoLine; card: ArqueoLine } {
  const line = (expectedCents: Cents, countedCents: Cents | null): ArqueoLine => ({
    expectedCents,
    countedCents,
    differenceCents: countedCents === null ? null : countedCents - expectedCents,
  });
  const cash = cashCount(summary, input.openingCashCents, input.countedCashCents);
  return {
    cash: { expectedCents: cash.expectedCashCents, countedCents: input.countedCashCents, differenceCents: cash.differenceCents },
    qr: line(summary.moneyInByMethod.QR, input.countedQrCents),
    card: line(summary.moneyInByMethod.CARD, input.countedCardCents),
  };
}
