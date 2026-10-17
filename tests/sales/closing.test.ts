import { describe, expect, it } from "vitest";

import { arqueo, cashCount, summarizeDay, type ClosingOrder } from "@/modules/sales/domain/closing";

const order = (o: Partial<ClosingOrder>): ClosingOrder => ({
  status: "CLOSED",
  channel: "LOCAL",
  subtotalCents: 0,
  discountCents: 0,
  totalCents: 0,
  items: [],
  payments: [],
  ...o,
});

describe("cierre del día", () => {
  const orders: ClosingOrder[] = [
    order({
      subtotalCents: 4800,
      totalCents: 4800,
      items: [
        { productName: "Majadito", quantity: 1, unitPriceCents: 3800, status: "ACTIVE", category: { name: "Platos", sortOrder: 0 } },
        { productName: "Gaseosa", quantity: 1, unitPriceCents: 1000, status: "ACTIVE", category: { name: "Bebidas", sortOrder: 5 } },
      ],
      payments: [{ method: "CASH", amountCents: 4800, refundedAt: null }],
    }),
    order({
      subtotalCents: 7600,
      discountCents: 760,
      totalCents: 6840,
      items: [{ productName: "Majadito", quantity: 2, unitPriceCents: 3800, status: "ACTIVE", category: { name: "Platos", sortOrder: 0 } }],
      payments: [
        { method: "QR", amountCents: 3000, refundedAt: null },
        { method: "CREDIT", amountCents: 3840, refundedAt: null },
      ],
    }),
    order({
      channel: "PEYA",
      status: "PAID",
      subtotalCents: 5300,
      totalCents: 5300,
      items: [{ productName: "Majadito", quantity: 1, unitPriceCents: 5300, status: "ACTIVE", category: { name: "Platos", sortOrder: 0 } }],
      payments: [{ method: "PEYA", amountCents: 5300, refundedAt: null }],
    }),
    order({ status: "OPEN", totalCents: 3000 }),
    order({ status: "CANCELLED", totalCents: 9999 }),
  ];
  const summary = summarizeDay(orders, [{ method: "CASH", amountCents: 2000 }]);

  it("ventas brutas, descuentos, netas y ticket promedio (solo cobradas)", () => {
    expect(summary).toMatchObject({
      paidCount: 3,
      grossCents: 17700,
      discountCents: 760,
      netCents: 16940,
      averageTicketCents: 5647,
      openCount: 1,
      openTotalCents: 3000,
      cancelledCount: 1,
    });
  });

  it("ventas por método: lo fiado aparece como venta pero NO como dinero que entró", () => {
    expect(summary.salesByMethod).toEqual({ CASH: 4800, QR: 3000, CARD: 0, PEYA: 5300, CREDIT: 3840 });
    // efectivo = 48 de ventas + 20 cobrados de un fiado anterior
    expect(summary.moneyInByMethod).toEqual({ CASH: 6800, QR: 3000, CARD: 0, PEYA: 5300, CREDIT: 0 });
  });

  it("por canal y productos más vendidos", () => {
    expect(summary.byChannel).toEqual({ LOCAL: { count: 2, netCents: 11640 }, PEYA: { count: 1, netCents: 5300 } });
    expect(summary.products[0]).toEqual({ name: "Majadito", category: "Platos", quantity: 4, amountCents: 16700 });
  });

  it("productos agrupados por categoría en el orden de la carta, con subtotales", () => {
    expect(summary.productsByCategory.map((c) => [c.category, c.quantity, c.amountCents])).toEqual([
      ["Platos", 4, 16700],
      ["Bebidas", 1, 1000],
    ]);
  });

  it("arqueo: esperado = fondo + efectivo del día; diferencia = contado - esperado", () => {
    expect(cashCount(summary, 10000, 16500)).toEqual({ expectedCashCents: 16800, differenceCents: -300 });
  });

  it("arqueo de QR y tarjeta contra lo del sistema (sin fondo inicial)", () => {
    const r = arqueo(summary, { openingCashCents: 0, countedCashCents: 6800, countedQrCents: 2500, countedCardCents: null });
    expect(r.cash).toEqual({ expectedCents: 6800, countedCents: 6800, differenceCents: 0 });
    expect(r.qr).toEqual({ expectedCents: 3000, countedCents: 2500, differenceCents: -500 });
    expect(r.card).toEqual({ expectedCents: 0, countedCents: null, differenceCents: null });
  });
});
