import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, disconnectDb } from "@/core/db/client";
import { eventBus } from "@/core/db/transaction";
import { businessDate } from "@/core/time";
import { purchaseBalance } from "@/modules/purchases";
import * as categories from "@/modules/catalog/services/categories";
import * as products from "@/modules/catalog/services/products";
import * as purchases from "@/modules/purchases/services/purchases";
import * as suppliers from "@/modules/purchases/services/suppliers";
import * as history from "@/modules/sales/services/history";

import { resetDatabase } from "../support/db";

async function setup() {
  const cat = await categories.createCategory({ name: "Insumos" });
  const base = { categoryId: cat.id, sendsToKitchen: false, active: true };
  const pan = await products.createProduct({ ...base, name: "Pan", type: "SUPPLY", tracksStock: true });
  const carne = await products.createProduct({ ...base, name: "Carne molida", type: "SUPPLY", baseUnit: "KG", tracksStock: true });
  const gas = await products.createProduct({ ...base, name: "Servilletas", type: "SUPPLY" }); // sin stock
  const bolsa = await products.addPresentation(pan.id, { name: "Bolsa x12", factor: "12" });
  const prov = await suppliers.createSupplier({ name: "Panadería Sol", phone: "70000000" });
  const user = await db.user.create({ data: { name: "Admin", role: "ADMIN", pinHash: "x" } });
  return { pan, carne, gas, bolsa, prov, user };
}

const today = businessDate();

describe("estado de cuentas por pagar", () => {
  it("pendiente / parcial / pagada y los anulados no cuentan", () => {
    expect(purchaseBalance(1000, [])).toEqual({ paidCents: 0, balanceCents: 1000, status: "PENDING" });
    expect(purchaseBalance(1000, [{ amountCents: 400, voidedAt: null }]).status).toBe("PARTIAL");
    expect(purchaseBalance(1000, [{ amountCents: 1000, voidedAt: null }]).status).toBe("PAID");
    expect(purchaseBalance(1000, [{ amountCents: 1000, voidedAt: new Date() }]).status).toBe("PENDING");
  });
});

describe("compras", () => {
  beforeEach(async () => {
    eventBus.reset();
    await resetDatabase();
  });
  afterAll(disconnectDb);

  it("convierte presentaciones y unidades, calcula costo unitario y actualiza el último costo", async () => {
    const { pan, carne, bolsa, user } = await setup();
    const p = await purchases.createPurchase(
      {
        date: today,
        paymentMode: "CASH_FULL",
        paymentMethod: "CASH",
        lines: [
          { productId: pan.id, presentation: bolsa.id, quantity: "2", totalCents: "36" }, // 24 panes
          { productId: carne.id, presentation: "unit:G", quantity: "1500", totalCents: "78" }, // 1,5 kg
        ],
      },
      user.id,
    );
    expect(p.totalCents).toBe(11400);
    const lines = Object.fromEntries(p.lines.map((l) => [l.productName, l]));
    expect(lines.Pan.baseQuantity.toString()).toBe("24");
    expect(lines.Pan.unitCostCents.toString()).toBe("150");
    expect(lines["Carne molida"].baseQuantity.toString()).toBe("1.5");
    expect(lines["Carne molida"].unitCostCents.toString()).toBe("5200");
    expect((await db.product.findUniqueOrThrow({ where: { id: carne.id } })).lastCostCents?.toString()).toBe("5200");

    const detail = await purchases.getPurchase(p.id);
    expect(detail).toMatchObject({ paymentStatus: "PAID", balanceCents: 0 });
  });

  it("crédito y pago parcial exigen proveedor; el pago parcial debe ser menor al total", async () => {
    const { pan, user, prov } = await setup();
    const line = { productId: pan.id, presentation: "unit:UNIT", quantity: "10", totalCents: "15" };
    await expect(purchases.createPurchase({ date: today, paymentMode: "CREDIT", lines: [line] }, user.id)).rejects.toThrow("elige el proveedor");
    await expect(
      purchases.createPurchase({ date: today, paymentMode: "PARTIAL", supplierId: prov.id, paidNow: "15", lines: [line] }, user.id),
    ).rejects.toThrow("menor al total");
    const p = await purchases.createPurchase(
      { date: today, paymentMode: "PARTIAL", supplierId: prov.id, paidNow: "5", paymentMethod: "TRANSFER", dueDate: "2026-11-01", lines: [line] },
      user.id,
    );
    expect(await purchases.getPurchase(p.id)).toMatchObject({ paymentStatus: "PARTIAL", balanceCents: 1000, dueDate: "2026-11-01" });
  });

  it("abonos: no deja pagar de más; anular un abono recalcula el estado", async () => {
    const { pan, user, prov } = await setup();
    const p = await purchases.createPurchase(
      { date: today, paymentMode: "CREDIT", supplierId: prov.id, lines: [{ productId: pan.id, presentation: "unit:UNIT", quantity: "10", totalCents: "100" }] },
      user.id,
    );
    await expect(purchases.addSupplierPayment(p.id, { date: today, amountCents: "100,01", method: "CASH" }, user.id)).rejects.toThrow(
      "supera el saldo",
    );
    const a1 = await purchases.addSupplierPayment(p.id, { date: today, amountCents: "60", method: "CASH" }, user.id);
    expect((await purchases.getPurchase(p.id))?.paymentStatus).toBe("PARTIAL");
    await purchases.addSupplierPayment(p.id, { date: today, amountCents: "40", method: "TRANSFER" }, user.id);
    expect((await purchases.getPurchase(p.id))?.paymentStatus).toBe("PAID");
    await expect(purchases.addSupplierPayment(p.id, { date: today, amountCents: "1", method: "CASH" }, user.id)).rejects.toThrow("ya está pagada");

    await expect(purchases.voidSupplierPayment(a1.id, " ", user.id)).rejects.toThrow("motivo");
    await purchases.voidSupplierPayment(a1.id, "Se registró dos veces", user.id);
    expect(await purchases.getPurchase(p.id)).toMatchObject({ paymentStatus: "PARTIAL", balanceCents: 6000 });
    expect(await purchases.listPayables()).toHaveLength(1);
  });

  it("anular compra: exige anular antes los pagos y emite el evento para revertir stock", async () => {
    const { pan, user } = await setup();
    const events: string[] = [];
    eventBus.onTransaction("purchase.cancelled", async ({ payload }) => {
      events.push(payload.purchaseId);
    });
    const p = await purchases.createPurchase(
      { date: today, paymentMode: "CASH_FULL", lines: [{ productId: pan.id, presentation: "unit:UNIT", quantity: "5", totalCents: "10" }] },
      user.id,
    );
    await expect(purchases.cancelPurchase(p.id, "Error de carga", user.id)).rejects.toThrow("anula primero los pagos");
    const pay = (await purchases.getPurchase(p.id))!.payments[0];
    await purchases.voidSupplierPayment(pay.id, "Error de carga", user.id);
    await purchases.cancelPurchase(p.id, "Error de carga", user.id);
    expect(events).toEqual([p.id]);
    expect((await purchases.getPurchase(p.id))?.status).toBe("CANCELLED");
  });

  it("un Preparado no se compra", async () => {
    const { user } = await setup();
    const cat = await db.category.findFirstOrThrow();
    const burger = await products.createProduct({ name: "Hamburguesa", categoryId: cat.id, type: "PREPARED", priceCents: "40", sendsToKitchen: true, active: true });
    await expect(
      purchases.createPurchase({ date: today, paymentMode: "CASH_FULL", lines: [{ productId: burger.id, presentation: "unit:UNIT", quantity: "1", totalCents: "10" }] }, user.id),
    ).rejects.toThrow("Preparado no se compra");
  });

  it("cierre de caja: el pago en efectivo a proveedores resta del esperado; transferencia no", async () => {
    const { pan, user, prov } = await setup();
    await db.cashOpening.create({ data: { businessDate: today, openingCashCents: 20000, openedById: user.id } });
    await purchases.createPurchase(
      { date: today, paymentMode: "CASH_FULL", paymentMethod: "CASH", supplierId: prov.id, lines: [{ productId: pan.id, presentation: "unit:UNIT", quantity: "10", totalCents: "45" }] },
      user.id,
    );
    await purchases.createPurchase(
      { date: today, paymentMode: "CASH_FULL", paymentMethod: "TRANSFER", lines: [{ productId: pan.id, presentation: "unit:UNIT", quantity: "10", totalCents: "30" }] },
      user.id,
    );
    const { summary } = await history.getDailyClosing(today);
    expect(summary.supplierPayments).toMatchObject({ cashCents: 4500, transferCents: 3000, totalCents: 7500 });
    expect(summary.supplierPayments?.payments[0]).toMatchObject({ supplier: "Panadería Sol", method: "CASH" });
    const saved = await history.saveClosing(today, { countedCashCents: 15500 }, user.id);
    expect(saved).toMatchObject({ expectedCashCents: 15500, differenceCents: 0 }); // 200 - 45
  });
});
