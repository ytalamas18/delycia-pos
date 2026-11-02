import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, disconnectDb } from "@/core/db/client";
import { eventBus } from "@/core/db/transaction";
import { addDays, businessDate } from "@/core/time";
import { inventoryModule } from "@/modules/inventory";
import { reportExports } from "@/modules/reports";

import * as products from "@/modules/catalog/services/products";
import * as ops from "@/modules/inventory/services/operations";
import * as purchases from "@/modules/purchases/services/purchases";
import {
  getAdjustmentsReport,
  getKardexReport,
  getPayablesReport,
  getPurchasesReport,
  getStockReport,
  getSupplierPaymentsReport,
} from "@/modules/reports/services/stock-purchases";

import { resetDatabase } from "../support/db";
import { createTestUser } from "../support/users";

const today = businessDate();

beforeEach(async () => {
  eventBus.reset();
  inventoryModule.registerSubscribers?.();
  await resetDatabase();
});
afterAll(async () => {
  eventBus.reset();
  await disconnectDb();
});

async function setup() {
  const user = await createTestUser(db);
  const cat = await db.category.create({ data: { name: "Insumos" } });
  const base = { categoryId: cat.id, sendsToKitchen: false, active: true, type: "SUPPLY" as const, tracksStock: true };
  const pan = await products.createProduct({ ...base, name: "Pan", minStock: "30" });
  const carne = await products.createProduct({ ...base, name: "Carne", baseUnit: "KG" });
  const sol = await db.supplier.create({ data: { name: "Sol" } });
  const luna = await db.supplier.create({ data: { name: "Luna" } });
  return { user, pan, carne, sol, luna };
}

describe("reportes de inventario y compras", () => {
  it("compras por proveedor e ítem, cuentas por pagar, stock valorizado y mermas", async () => {
    const { user, pan, carne, sol, luna } = await setup();
    await purchases.createPurchase(
      {
        date: today,
        paymentMode: "CREDIT",
        supplierId: sol.id,
        dueDate: "2020-01-01", // vencida
        lines: [{ productId: pan.id, presentation: "unit:UNIT", quantity: "24", totalCents: "36" }],
      },
      user.id,
    );
    await purchases.createPurchase(
      {
        date: today,
        paymentMode: "PARTIAL",
        paidNow: "50",
        supplierId: luna.id,
        lines: [
          { productId: carne.id, presentation: "unit:KG", quantity: "2", totalCents: "104" },
          { productId: pan.id, presentation: "unit:UNIT", quantity: "12", totalCents: "18" },
        ],
      },
      user.id,
    );

    const pr = await getPurchasesReport({ from: today, to: today });
    expect(pr).toMatchObject({ totalCents: 15800, paidCents: 5000, balanceCents: 10800 });
    expect(pr.bySupplier.map((s) => [s.name, s.totalCents])).toEqual([["Luna", 12200], ["Sol", 3600]]);
    expect(pr.byItem.map((i) => [i.name, i.quantity.toString(), i.totalCents])).toEqual([["Carne", "2", 10400], ["Pan", "36", 5400]]);

    const pay = await getPayablesReport();
    expect(pay).toMatchObject({ totalCents: 10800, overdueCents: 3600 });

    const stock = await getStockReport({});
    expect(stock.items.map((i) => [i.name, i.stock.toString()])).toEqual([["Carne", "2"], ["Pan", "36"]]);
    // valor: carne 2 × 5200 + pan 36 × 150 (último costo)
    expect(stock.totalValueCents.toString()).toBe("15800");
    expect((await getStockReport({ onlyAlerts: true })).items).toHaveLength(0);

    await ops.createCount({ date: today, lines: [{ productId: pan.id, counted: "30", reason: "Se aplastaron" }] }, user.id);
    const adj = await getAdjustmentsReport({ from: today, to: today });
    expect(adj.rows.map((a) => a.difference.toString())).toEqual(["-6"]);
    expect(adj.lostCents.toString()).toBe("900");

    const k = await getKardexReport(pan.id, { from: today, to: today });
    expect(k.rows.map((m) => m.balance.toString())).toEqual(["24", "36", "30"]);

    const doc = await reportExports["cuentas-por-pagar"]({});
    expect(doc.tables[1].rows).toHaveLength(2);
    expect((await reportExports.compras({ desde: today, hasta: today })).tables[0].totals?.[4]).toBe(15800);
    expect((await reportExports.kardex({ desde: today, hasta: today, item: pan.id })).tables[0].rows).toHaveLength(3);
    expect((await reportExports.mermas({ desde: today, hasta: today })).summary?.[1].value).toBe(900);
    expect((await reportExports.stock({})).tables[0].rows).toHaveLength(2);
  });
});

describe("reporte de pagos a proveedores", () => {
  it("por fecha del pago, con filtros de método/cuenta; anulados aparte y no suman", async () => {
    const { user, pan, carne, sol } = await setup();
    const yesterday = addDays(today, -1);
    // Compra a crédito de ayer, pagada hoy por transferencia: cuenta el día del pago.
    const credito = await purchases.createPurchase(
      { date: yesterday, paymentMode: "CREDIT", supplierId: sol.id, lines: [{ productId: carne.id, presentation: "unit:KG", quantity: "2", totalCents: "100" }] },
      user.id,
    );
    await purchases.addSupplierPayment(credito.id, { date: today, amountCents: "60", method: "TRANSFER", reference: "TRX-1", note: "abono" }, user.id);
    const contado = await purchases.createPurchase(
      { date: today, paymentMode: "CASH_FULL", paymentMethod: "CASH", supplierId: sol.id, lines: [{ productId: pan.id, presentation: "unit:UNIT", quantity: "10", totalCents: "20" }] },
      user.id,
    );
    const anulado = await purchases.addSupplierPayment(credito.id, { date: today, amountCents: "5", method: "CASH" }, user.id);
    await purchases.voidSupplierPayment(anulado.id, "Error de monto", user.id);

    const r = await getSupplierPaymentsReport({ from: today, to: today });
    expect(r.totalCents).toBe(8000);
    expect(r.byMethod).toEqual({ CASH: 2000, TRANSFER: 6000, CARD: 0 });
    expect(r.byAccount).toEqual({ CASH: 2000, BANK: 6000, ATC_PEYA: 0 });
    expect(r.voidedCents).toBe(500);
    expect(r.voided[0]).toMatchObject({ voidReason: "Error de monto", voidedByName: "Admin" });
    expect(r.active.map((p) => [p.purchaseNumber, p.supplier, p.reference, p.createdByName])).toEqual([
      [credito.number, "Sol", "TRX-1", "Admin"],
      [contado.number, "Sol", null, "Admin"],
    ]);
    expect(r.active[0].items).toEqual([{ name: "Carne", category: "Insumos" }]);

    const banco = await getSupplierPaymentsReport({ from: today, to: today }, { account: "BANK" });
    expect(banco.active.map((p) => p.reference)).toEqual(["TRX-1"]);
    const ayer = await getSupplierPaymentsReport({ from: yesterday, to: yesterday });
    expect(ayer.active).toHaveLength(0);

    const doc = await reportExports["pagos-proveedores"]({ desde: today, hasta: today, cuenta: "CASH" });
    expect(doc.tables[0].rows).toHaveLength(1);
    expect(doc.tables[0].totals?.[8]).toBe(2000);
    expect(doc.tables.map((t) => t.title)).toEqual(["Pagos", "Por método", "Por cuenta", "Anulados"]);
  });
});
