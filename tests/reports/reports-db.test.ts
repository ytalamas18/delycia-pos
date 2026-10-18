import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db, disconnectDb } from "@/core/db/client";
import { eventBus } from "@/core/db/transaction";
import { kitchenModule } from "@/modules/kitchen";
import { salesModule } from "@/modules/sales";

import { reportExports } from "@/modules/reports";
import { getMoneyIn, getProductsSold, getReceivables, getSalesByChannel, getVoids } from "@/modules/reports/services/reports";
import * as history from "@/modules/sales/services/history";
import { buildHistoryExport } from "@/modules/sales";
import * as checkout from "@/modules/sales/services/checkout";
import * as orders from "@/modules/sales/services/orders";
import * as voids from "@/modules/sales/services/voids";

import { seed } from "../../prisma/seed-data";
import { resetDatabase } from "../support/db";
import { seedTestCatalog } from "../support/test-catalog";

const line = (productId: string, quantity = 1) => ({ productId, quantity, modifierIds: [] as string[], note: "", serviceType: "TAKEAWAY" as const });
const takeaway = { channel: "LOCAL" as const, serviceType: "TAKEAWAY" as const, customerName: "Ana" };

async function fixtures() {
  await seed(db, { Admin: "4826", Caja: "5937", Cocina: "6048" }, { menu: false });
  await seedTestCatalog(db);
  const caja = await db.user.findUniqueOrThrow({ where: { name: "Caja" } });
  const plato = await db.product.findFirstOrThrow({ where: { name: "Majadito (ejemplo)" } }); // 38 Bs, Platos
  const gaseosa = await db.product.findFirstOrThrow({ where: { name: "Gaseosa 500 ml (ejemplo)" } }); // 10 Bs, Bebidas
  return { caja, plato, gaseosa, actor: { userId: caja.id, authorizedById: caja.id } };
}

/** Crea y cobra una orden "como si" fuera el instante `at` (el día de negocio sale de esa hora). */
async function saleAt(at: string, userId: string, lines: ReturnType<typeof line>[], entries: { method: "CASH" | "QR" | "CARD"; amountCents: number }[]) {
  vi.setSystemTime(new Date(at));
  const order = await orders.createOrder(takeaway, lines, userId);
  await checkout.payOrder(order.id, { discount: null, entries }, userId);
  return order;
}

beforeEach(async () => {
  eventBus.reset();
  kitchenModule.registerSubscribers?.();
  salesModule.registerSubscribers?.();
  await resetDatabase();
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterEach(() => vi.useRealTimers());
afterAll(async () => {
  eventBus.reset();
  await disconnectDb();
});

describe("reportes contra la base", () => {
  it("cuenta cada venta en su día de La Paz (23:30 del 17 = 03:30 UTC del 18)", async () => {
    const { caja, gaseosa } = await fixtures();
    await saleAt("2026-10-18T03:30:00Z", caja.id, [line(gaseosa.id)], [{ method: "CASH", amountCents: 1000 }]); // 17 en La Paz
    await saleAt("2026-10-18T04:10:00Z", caja.id, [line(gaseosa.id, 2)], [{ method: "QR", amountCents: 2000 }]); // 18 en La Paz

    const d17 = await getSalesByChannel({ from: "2026-10-17", to: "2026-10-17" });
    expect(d17.totals.total).toMatchObject({ orders: 1, totalCents: 1000 });
    expect(d17.totals.byChannel.CASH.totalCents).toBe(1000);
    expect(d17.totals.byChannel.QR.totalCents).toBe(0);

    const d18 = await getSalesByChannel({ from: "2026-10-18", to: "2026-10-18" });
    expect(d18.totals.total).toMatchObject({ orders: 1, totalCents: 2000 });

    const both = await getSalesByChannel({ from: "2026-10-17", to: "2026-10-18" });
    expect(both.days.map((d) => d.total.totalCents)).toEqual([1000, 2000]);
  });

  it("solo cuentan las cobradas; anuladas aparte; pago mixto una vez en el total", async () => {
    const { caja, plato, gaseosa, actor } = await fixtures();
    const day = "2026-10-17T15:00:00Z";
    // mixta: 48 Bs = 30 QR + 18 efectivo
    await saleAt(day, caja.id, [line(plato.id), line(gaseosa.id)], [
      { method: "QR", amountCents: 3000 },
      { method: "CASH", amountCents: 1800 },
    ]);
    await saleAt(day, caja.id, [line(gaseosa.id)], [{ method: "CASH", amountCents: 1000 }]);
    const cancelled = await saleAt(day, caja.id, [line(plato.id)], [{ method: "CARD", amountCents: 3800 }]);
    await voids.cancelOrder(cancelled.id, "Se cobró mal", actor, "2026-10-17");
    // por pagar: no cuenta
    await orders.createOrder(takeaway, [line(plato.id, 3)], caja.id);

    const r = await getSalesByChannel({ from: "2026-10-17", to: "2026-10-17" });
    expect(r.totals.total).toEqual({ orders: 2, totalCents: 5800, averageCents: 2900 });
    expect(r.totals.byChannel.CASH).toEqual({ orders: 2, totalCents: 2800, averageCents: 1400 });
    expect(r.totals.byChannel.QR).toEqual({ orders: 1, totalCents: 3000, averageCents: 3000 });
    expect(r.totals.byChannel.CARD.totalCents).toBe(0);
    expect(r.totals.cancelled).toMatchObject({ orders: 1, totalCents: 3800 });
  });

  it("productos: precio guardado en la orden, anulados aparte y filtro por categoría", async () => {
    const { caja, plato, gaseosa, actor } = await fixtures();
    vi.setSystemTime(new Date("2026-10-17T15:00:00Z"));
    const order = await orders.createOrder(takeaway, [line(plato.id, 2), line(gaseosa.id, 3)], caja.id);
    const soda = (await orders.getOrder(order.id))!.items.find((i) => i.productId === gaseosa.id)!;
    await voids.voidItem(order.id, soda.id, "Error al cargar", actor);
    await checkout.payOrder(order.id, { discount: null, entries: [{ method: "CASH", amountCents: 7600 }] }, caja.id);
    await saleAt("2026-10-17T16:00:00Z", caja.id, [line(gaseosa.id)], [{ method: "CASH", amountCents: 1000 }]);

    // Subir el precio después NO cambia lo vendido.
    await db.product.update({ where: { id: plato.id }, data: { priceCents: 9900 } });

    const range = { from: "2026-10-17", to: "2026-10-17" };
    const all = await getProductsSold(range);
    expect(all.products.map((p) => [p.name, p.quantity, p.totalCents])).toEqual([
      ["Majadito (ejemplo)", 2, 7600],
      ["Gaseosa 500 ml (ejemplo)", 1, 1000],
    ]);
    expect(all.totals).toEqual({ quantity: 3, totalCents: 8600 });
    expect(all.voided.products.map((p) => [p.name, p.quantity, p.totalCents])).toEqual([["Gaseosa 500 ml (ejemplo)", 3, 3000]]);
    expect(all.products[0].category).toBe("Test Platos");

    const bebidas = await db.category.findFirstOrThrow({ where: { products: { some: { id: gaseosa.id } } } });
    const onlyDrinks = await getProductsSold(range, { categoryId: bebidas.id });
    expect(onlyDrinks.products.map((p) => p.name)).toEqual(["Gaseosa 500 ml (ejemplo)"]);
    expect(onlyDrinks.totals).toEqual({ quantity: 1, totalCents: 1000 });

    const otherDay = await getProductsSold({ from: "2026-10-18", to: "2026-10-18" });
    expect(otherDay.products).toEqual([]);
  });

  it("la exportación usa los mismos filtros que la pantalla", async () => {
    const { caja, plato, gaseosa, actor } = await fixtures();
    await saleAt("2026-10-17T15:00:00Z", caja.id, [line(plato.id), line(gaseosa.id, 2)], [{ method: "CASH", amountCents: 5800 }]);
    const cancelled = await saleAt("2026-10-17T16:00:00Z", caja.id, [line(gaseosa.id)], [{ method: "QR", amountCents: 1000 }]);
    await voids.cancelOrder(cancelled.id, "Se cobró mal", actor, "2026-10-17");
    const bebidas = await db.category.findFirstOrThrow({ where: { name: "Test Bebidas" } });

    const products = await reportExports["productos-vendidos"]({ desde: "2026-10-17", hasta: "2026-10-17", cat: bebidas.id });
    expect(products.fileBase).toBe("productos-vendidos_test-bebidas_2026-10-17");
    expect(products.filters).toContain("Categoría: Test Bebidas");
    expect(products.tables[0].rows).toEqual([["Gaseosa 500 ml (ejemplo)", "Test Bebidas", 2, 2000]]);
    expect(products.tables[0].totals).toEqual(["Total", null, 2, 2000]);

    const sales = await reportExports["ventas-por-canal"]({ desde: "2026-10-17", hasta: "2026-10-17" });
    expect(sales.tables[0].rows).toEqual([["EFECTIVO", 1, 5800, 5800, 1]]);

    const history = await buildHistoryExport("2026-10-17", { estado: "CANCELLED" });
    expect(history.filters).toEqual(["Estado: Anulada"]);
    expect(history.tables[0].rows).toHaveLength(1);
    expect(history.tables[0].rows[0][5]).toBe("Anulada");
    expect(history.tables[0].rows[0][9]).toBe(0); // anulada: no suma en "Cobrado"
    expect(history.tables[0].rows[0][10]).toBe("Se cobró mal");
  });

  it("anulaciones: órdenes e ítems por hora de anulación (La Paz), motivo agrupado y sin doble conteo", async () => {
    const { caja, plato, gaseosa } = await fixtures();
    const admin = await db.user.findUniqueOrThrow({ where: { name: "Admin" } });
    const actor = { userId: caja.id, authorizedById: admin.id };

    // 17/10 15:00: orden por pagar en cocina; se anula la gaseosa (no va a cocina) y después la orden entera.
    vi.setSystemTime(new Date("2026-10-17T15:00:00Z"));
    const open = await orders.createOrder(takeaway, [line(plato.id), line(gaseosa.id)], caja.id);
    await orders.sendToKitchen(open.id);
    const soda = (await orders.getOrder(open.id))!.items.find((i) => i.productId === gaseosa.id)!;
    await voids.voidItem(open.id, soda.id, "Error al cargar", actor);
    await voids.cancelOrder(open.id, "  cliente se fue ", actor);
    // 17/10 23:30 en La Paz (03:30 UTC del 18): cobrada y anulada → cuenta el 17.
    const paid = await saleAt("2026-10-18T03:30:00Z", caja.id, [line(plato.id)], [{ method: "CASH", amountCents: 3800 }]);
    await voids.cancelOrder(paid.id, "Cliente se fue.", { userId: admin.id, authorizedById: admin.id }, "2026-10-17");
    // 18/10 en La Paz: no entra en el reporte del 17.
    vi.setSystemTime(new Date("2026-10-18T15:00:00Z"));
    const other = await orders.createOrder(takeaway, [line(gaseosa.id)], caja.id);
    await voids.cancelOrder(other.id, "Otro día", actor);

    const r = await getVoids({ from: "2026-10-17", to: "2026-10-17" });
    expect(r.totals).toEqual({ count: 3, orders: 2, items: 1, amountCents: 1000 + 3800 + 3800 });
    expect(r.byReason).toEqual([
      { reason: "cliente se fue", count: 2, amountCents: 7600 },
      { reason: "Error al cargar", count: 1, amountCents: 1000 },
    ]);
    const item = r.entries.find((e) => e.kind === "item")!;
    expect(item).toMatchObject({ orderNumber: 1, inKitchen: false, wasPaid: false, voidedBy: "Caja", authorizedBy: "Admin" });
    const cancelledOpen = r.entries.find((e) => e.kind === "order" && e.orderNumber === 1)!;
    expect(cancelledOpen).toMatchObject({ amountCents: 3800, products: "1× Majadito (ejemplo)", inKitchen: true, wasPaid: false });
    const cancelledPaid = r.entries.find((e) => e.kind === "order" && e.orderNumber === 2)!;
    expect(cancelledPaid).toMatchObject({ wasPaid: true, voidedBy: "Admin", authorizedBy: null, inKitchen: false });

    const exp = await reportExports.anulaciones({ desde: "2026-10-17", hasta: "2026-10-17" });
    expect(exp.fileBase).toBe("anulaciones_2026-10-17");
    expect(exp.tables[1].rows).toHaveLength(3);
    expect(exp.tables[1].totals?.[5]).toBe(8600);
  });

  it("cuentas por cobrar: saldo, estado, método de pago, filtros y total por cliente", async () => {
    const { caja, plato, gaseosa } = await fixtures();
    const credit = async (at: string, customer: string, lines: ReturnType<typeof line>[], amountCents: number) => {
      vi.setSystemTime(new Date(at));
      const o = await orders.createOrder({ ...takeaway, customerName: customer }, lines, caja.id);
      await checkout.payOrder(o.id, { discount: null, entries: [{ method: "CREDIT", amountCents }] }, caja.id);
      return (await orders.getOrder(o.id))!.payments[0];
    };
    // Don Pedro fía 48 Bs el 17; abona 10 por QR el 17 y 38 en efectivo el 18 → pagada.
    const p1 = await credit("2026-10-17T15:00:00Z", "Don Pedro", [line(plato.id), line(gaseosa.id)], 4800);
    vi.setSystemTime(new Date("2026-10-17T20:00:00Z"));
    await checkout.collectCredit(p1.id, { method: "QR", amountCents: 1000 }, caja.id);
    vi.setSystemTime(new Date("2026-10-18T15:00:00Z"));
    await checkout.collectCredit(p1.id, { method: "CASH", amountCents: 3800 }, caja.id);
    // "don pedro " (mismo cliente, escrito distinto) fía 10 Bs el 17 y no paga.
    await credit("2026-10-17T16:00:00Z", "don pedro ", [line(gaseosa.id)], 1000);
    // Ana fía 38 el 17.
    await credit("2026-10-17T17:00:00Z", "Ana", [line(plato.id)], 3800);
    // Venta normal en efectivo el 17 (para comparar venta vs dinero).
    await saleAt("2026-10-17T18:00:00Z", caja.id, [line(gaseosa.id)], [{ method: "CASH", amountCents: 1000 }]);

    const range = { from: "2026-10-17", to: "2026-10-17" };
    const all = await getReceivables(range);
    expect(all.totals).toEqual({ accounts: 3, amountCents: 9600, collectedCents: 4800, balanceCents: 4800 });
    expect(all.customers).toEqual(["Ana", "don pedro"]);
    expect(all.byCustomer).toEqual([
      { customer: "Ana", accounts: 1, amountCents: 3800, collectedCents: 0, balanceCents: 3800 },
      { customer: "don pedro", accounts: 2, amountCents: 5800, collectedCents: 4800, balanceCents: 1000 },
    ]);
    const paid = all.rows.find((r) => r.paymentId === p1.id)!;
    expect(paid).toMatchObject({ status: "pagada", balanceCents: 0, methods: ["QR", "CASH"] });
    expect(paid.settledAt).toBeInstanceOf(Date);

    expect((await getReceivables(range, { status: "pendiente" })).rows).toHaveLength(2);
    expect((await getReceivables(range, { status: "pagada" })).rows).toHaveLength(1);
    const pedro = await getReceivables(range, { customer: "DON PEDRO" });
    expect(pedro.totals).toMatchObject({ accounts: 2, balanceCents: 1000 });

    // Venta del día ≠ dinero cobrado: el 17 se vendieron 106 Bs (96 fiados), pero entraron 10 + 10 (abono QR).
    const sales17 = await getSalesByChannel(range);
    expect(sales17.totals.total.totalCents).toBe(10600);
    expect(sales17.totals.byChannel.CREDIT.totalCents).toBe(9600);
    const money17 = await getMoneyIn(range);
    expect(money17.creditSalesCents).toBe(9600);
    expect(money17.rows).toEqual([
      { channel: "CASH", salesCents: 1000, collectionsCents: 0, totalCents: 1000 },
      { channel: "QR", salesCents: 0, collectionsCents: 1000, totalCents: 1000 },
    ]);
    // El abono del 18 entra el 18 (aunque la orden sea del 17).
    const money18 = await getMoneyIn({ from: "2026-10-18", to: "2026-10-18" });
    expect(money18.totals).toEqual({ salesCents: 0, collectionsCents: 3800, totalCents: 3800 });

    // Cuadra con el cierre de caja de cada día.
    for (const [day, m] of [["2026-10-17", money17], ["2026-10-18", money18]] as const) {
      const { summary } = await history.getDailyClosing(day);
      const closingIn = Object.values(summary.moneyInByMethod).reduce((s, v) => s + v, 0);
      expect(m.totals.totalCents).toBe(closingIn);
    }

    const exp = await reportExports["cuentas-por-cobrar"]({ desde: "2026-10-17", hasta: "2026-10-17", estado: "pendiente" });
    expect(exp.filters).toContain("Estado: Pendientes");
    expect(exp.tables[1].rows).toHaveLength(2);
    expect(exp.tables[1].totals?.[5]).toBe(4800);
  });
});
