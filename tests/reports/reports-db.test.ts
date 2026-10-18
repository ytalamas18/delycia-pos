import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db, disconnectDb } from "@/core/db/client";
import { eventBus } from "@/core/db/transaction";
import { kitchenModule } from "@/modules/kitchen";
import { salesModule } from "@/modules/sales";

import { reportExports } from "@/modules/reports";
import { getProductsSold, getSalesByChannel } from "@/modules/reports/services/reports";
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
});
