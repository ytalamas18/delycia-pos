import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, disconnectDb } from "@/core/db/client";
import { eventBus } from "@/core/db/transaction";
import { addDays, businessDate } from "@/core/time";
import { kitchenModule } from "@/modules/kitchen";
import { cashbookExport, reportExports } from "@/modules/reports";
import { buildLedger, cashDifferences, type LedgerMovement } from "@/modules/reports/domain/cashbook";
import { getCashbook } from "@/modules/reports/services/cashbook";
import { salesModule } from "@/modules/sales";

import * as categories from "@/modules/catalog/services/categories";
import * as products from "@/modules/catalog/services/products";
import * as purchases from "@/modules/purchases/services/purchases";
import * as checkout from "@/modules/sales/services/checkout";
import * as history from "@/modules/sales/services/history";
import * as orders from "@/modules/sales/services/orders";
import * as voids from "@/modules/sales/services/voids";
import * as accounts from "@/modules/treasury/services/accounts";
import * as withdrawals from "@/modules/treasury/services/withdrawals";

import { seed } from "../../prisma/seed-data";
import { resetDatabase } from "../support/db";
import { seedTestCatalog } from "../support/test-catalog";

const today = businessDate();
const yesterday = addDays(today, -1);

const mv = (m: Partial<LedgerMovement> & Pick<LedgerMovement, "date" | "account" | "amountCents">): LedgerMovement => ({
  at: null,
  kind: "SALES",
  detail: "x",
  ...m,
});

describe("libro de caja y bancos (armado)", () => {
  it("orden cronológico, saldo anterior y saldo acumulado por cuenta y total", () => {
    const book = buildLedger({
      range: { from: today, to: today },
      openings: [{ account: "CASH", date: yesterday, amountCents: 10000 }],
      movements: [
        mv({ date: yesterday, account: "CASH", amountCents: 2000 }),
        mv({ date: today, account: "BANK", amountCents: 3000 }),
        mv({ date: today, account: "CASH", amountCents: -500, kind: "WITHDRAWAL", at: new Date("2026-01-01T10:00:00Z") }),
        mv({ date: addDays(today, -5), account: "CASH", amountCents: 99999 }), // antes del saldo inicial: no cuenta
      ],
    });
    expect(book.accounts.find((a) => a.account === "CASH")).toMatchObject({ beforeCents: 12000, inCents: 0, outCents: 500, endCents: 11500 });
    expect(book.accounts.find((a) => a.account === "BANK")).toMatchObject({ beforeCents: 0, inCents: 3000, endCents: 3000 });
    // Dentro del día: primero lo que tiene hora y al final las ventas del día.
    expect(book.lines.map((l) => [l.account, l.amountCents, l.balanceCents, l.totalBalanceCents])).toEqual([
      ["CASH", -500, 11500, 11500],
      ["BANK", 3000, 3000, 14500],
    ]);
    expect(book.total).toMatchObject({ beforeCents: 12000, inCents: 3000, outCents: 500, endCents: 14500 });
  });

  it("filtrar por cuenta deja solo esa cuenta", () => {
    const book = buildLedger({
      range: { from: today, to: today },
      openings: [],
      movements: [mv({ date: today, account: "CASH", amountCents: 100 }), mv({ date: today, account: "BANK", amountCents: 200 })],
      account: "BANK",
    });
    expect(book.accounts.map((a) => a.account)).toEqual(["BANK"]);
    expect(book.lines.map((l) => l.amountCents)).toEqual([200]);
    expect(book.total.endCents).toBe(200);
  });

  it("diferencia de arqueo: contado − fondo − movimientos del día en Efectivo", () => {
    const diffs = cashDifferences(
      [mv({ date: today, account: "CASH", amountCents: 5000 }), mv({ date: today, account: "CASH", amountCents: -1000, kind: "WITHDRAWAL" })],
      [
        { date: today, openingCashCents: 10000, countedCashCents: 13500 }, // esperado 14000 → falta 5
        { date: yesterday, openingCashCents: 0, countedCashCents: 0 }, // cuadra: sin línea
      ],
    );
    expect(diffs).toEqual([expect.objectContaining({ date: today, account: "CASH", kind: "CASH_DIFFERENCE", amountCents: -500 })]);
    expect(diffs[0].detail).toContain("faltante");
  });
});

describe("libro de caja y bancos (con la base)", () => {
  beforeEach(async () => {
    eventBus.reset();
    kitchenModule.registerSubscribers?.();
    salesModule.registerSubscribers?.();
    await resetDatabase();
  });
  afterAll(async () => {
    eventBus.reset();
    await disconnectDb();
  });

  it("cuadra con el cierre de caja y arma Banco y ATC/PeYa con traspasos y comisión", async () => {
    await seed(db);
    await seedTestCatalog(db);
    const caja = await db.user.findUniqueOrThrow({ where: { username: "caja" } });
    const admin = await db.user.findUniqueOrThrow({ where: { username: "admin" } });
    const gaseosa = await db.product.findFirstOrThrow({ where: { name: "Gaseosa 500 ml (ejemplo)" } }); // 10 Bs
    const line = (quantity: number) => [{ productId: gaseosa.id, quantity, modifierIds: [], note: "", serviceType: "TAKEAWAY" as const }];
    const sell = async (quantity: number, method: "CASH" | "QR" | "CARD" | "PEYA" | "CREDIT", channel: "LOCAL" | "PEYA" = "LOCAL") => {
      const o = await orders.createOrder({ channel, serviceType: "TAKEAWAY", customerName: "Ana" }, line(quantity), caja.id);
      const order = await orders.getOrder(o.id);
      await checkout.payOrder(o.id, { discount: null, entries: [{ method, amountCents: order!.totalCents }] }, caja.id);
      return o;
    };

    await accounts.setOpeningBalance({ account: "CASH", date: today, amountCents: 10000 }, admin.id);
    await accounts.setOpeningBalance({ account: "BANK", date: today, amountCents: 50000 }, admin.id);
    await expect(accounts.setOpeningBalance({ account: "BANK", date: today, amountCents: 1 }, admin.id)).rejects.toThrow("ya tiene saldo inicial");
    await history.openCash(today, { openingCashCents: 10000 }, caja.id);

    await sell(2, "CASH"); // 20
    await sell(3, "QR"); // 30
    await sell(1, "CARD"); // 10
    await sell(1, "PEYA", "PEYA"); // 14 (40 %)
    const fiado = await sell(5, "CREDIT"); // 50 fiado: no entra
    const credit = await db.payment.findFirstOrThrow({ where: { orderId: fiado.id } });
    await checkout.collectCredit(credit.id, { method: "CASH", amountCents: 2000 }, caja.id); // entra 20
    const anulada = await sell(1, "CASH"); // 10, se devuelve
    await voids.cancelOrder(anulada.id, "Error de cobro", { userId: admin.id, authorizedById: admin.id });

    const cat = await categories.createCategory({ name: "Gastos operativos" });
    const taxi = await products.createProduct({ name: "Transporte", categoryId: cat.id, type: "SUPPLY", sendsToKitchen: false, active: true });
    await purchases.createPurchase(
      { date: today, paymentMode: "CASH_FULL", paymentMethod: "CASH", lines: [{ productId: taxi.id, presentation: "unit:UNIT", quantity: "1", totalCents: "15" }] },
      admin.id,
    );
    const prov = await db.supplier.create({ data: { name: "Sol" } });
    const aCredito = await purchases.createPurchase(
      { date: today, paymentMode: "CREDIT", supplierId: prov.id, lines: [{ productId: taxi.id, presentation: "unit:UNIT", quantity: "1", totalCents: "40" }] },
      admin.id,
    );
    await purchases.addSupplierPayment(aCredito.id, { date: today, amountCents: "25", method: "TRANSFER", reference: "TRX-9" }, admin.id);

    await withdrawals.createWithdrawal({ amountCents: 3000, reason: "Dueño" }, caja.id);
    await accounts.createTransfer({ date: today, fromAccount: "ATC_PEYA", toAccount: "BANK", amountOutCents: 2400, amountInCents: 2200 }, admin.id);
    await accounts.createTransfer({ date: today, fromAccount: "CASH", toAccount: "BANK", amountOutCents: 4000, amountInCents: 4000 }, admin.id);

    // Cierre: esperado = 100 + 20 + 20 − 15 − 30 − 40 = 55; contado 50 → falta 5.
    const saved = await history.saveClosing(today, { countedCashCents: 5000 }, caja.id);
    expect(saved).toMatchObject({ expectedCashCents: 5500, differenceCents: -500 });

    const book = await getCashbook({ from: today, to: today });
    const end = Object.fromEntries(book.accounts.map((a) => [a.account, a.endCents]));
    // Efectivo = lo contado en el cierre (el saldo inicial era lo que había en caja).
    expect(end).toEqual({ CASH: 5000, BANK: 56700, ATC_PEYA: 0 });
    expect(book.lines.filter((l) => l.kind === "SALES").map((l) => [l.account, l.detail, l.amountCents])).toEqual([
      ["CASH", "Ventas en efectivo", 2000],
      ["BANK", "Ventas por QR", 3000],
      ["ATC_PEYA", "Ventas con tarjeta", 1000],
      ["ATC_PEYA", "Ventas PeYa", 1400],
    ]);
    expect(book.lines.find((l) => l.kind === "COMMISSION")).toMatchObject({ account: "ATC_PEYA", amountCents: -200 });
    expect(book.lines.find((l) => l.kind === "CASH_DIFFERENCE")).toMatchObject({ amountCents: -500 });
    const pago = book.lines.find((l) => l.kind === "SUPPLIER_PAYMENT" && l.account === "CASH");
    expect(pago?.items).toBe("Transporte (Gastos operativos)");
    expect(book.lines.find((l) => l.kind === "SUPPLIER_PAYMENT" && l.account === "BANK")).toMatchObject({ amountCents: -2500, reference: "TRX-9" });
    expect(book.lines.find((l) => l.kind === "COLLECTION")).toMatchObject({ account: "CASH", amountCents: 2000 });
    // La compra a crédito sin pagar (15 Bs restantes) no aparece; el saldo total es el último de la lista.
    expect(book.lines.at(-1)?.totalBalanceCents).toBe(61700);
    expect(book.missingOpenings).toEqual(["ATC_PEYA"]);

    // Traspaso desde Efectivo: resta del cierre y solo con fecha de hoy; hacia Efectivo, no por ahora.
    const { summary } = await history.getDailyClosing(today);
    expect(summary.cashTransfers?.totalCents).toBe(4000);
    await expect(
      accounts.createTransfer({ date: yesterday, fromAccount: "CASH", toAccount: "BANK", amountOutCents: 1, amountInCents: 1 }, admin.id),
    ).rejects.toThrow("fecha de hoy");
    await expect(
      accounts.createTransfer({ date: today, fromAccount: "BANK", toAccount: "CASH", amountOutCents: 1, amountInCents: 1 }, admin.id),
    ).rejects.toThrow("hacia Efectivo");
    await expect(
      accounts.createTransfer({ date: today, fromAccount: "ATC_PEYA", toAccount: "BANK", amountOutCents: 100, amountInCents: 200 }, admin.id),
    ).rejects.toThrow("comisión");

    // Anular un traspaso lo saca del libro y del cierre.
    const t = await db.accountTransfer.findFirstOrThrow({ where: { fromAccount: "CASH" } });
    await accounts.voidTransfer(t.id, "Se registró mal", admin.id);
    expect((await history.getDailyClosing(today)).summary.cashTransfers?.totalCents).toBe(0);
    const after = await getCashbook({ from: today, to: today }, "CASH");
    // El cierre guardado (contado 50) sigue mandando: la diferencia se recalcula y el saldo sigue en lo contado.
    expect(after.accounts[0].endCents).toBe(5000);
    expect(after.lines.find((l) => l.kind === "CASH_DIFFERENCE")?.amountCents).toBe(-4500);

    // Exporte (permiso propio) y saldo anterior al día siguiente.
    const doc = await cashbookExport({ desde: today, hasta: today });
    expect(doc.tables.map((t) => t.title)).toEqual(["Saldos por cuenta", "Movimientos"]);
    expect(reportExports["libro-caja-bancos"]).toBeUndefined();
    const nextDay = await getCashbook({ from: addDays(today, 1), to: addDays(today, 1) });
    expect(nextDay.total.beforeCents).toBe(5000 + 52700);
    expect(nextDay.lines).toEqual([]);
  });
});
