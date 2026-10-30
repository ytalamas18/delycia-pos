import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, disconnectDb } from "@/core/db/client";
import { eventBus } from "@/core/db/transaction";
import { businessDate } from "@/core/time";
import { kitchenModule } from "@/modules/kitchen";
import { salesModule } from "@/modules/sales";

import * as checkout from "@/modules/sales/services/checkout";
import * as history from "@/modules/sales/services/history";
import * as orders from "@/modules/sales/services/orders";

import { seed } from "../../prisma/seed-data";
import { resetDatabase } from "../support/db";
import { seedTestCatalog } from "../support/test-catalog";

const line = (productId: string) => ({ productId, quantity: 1, modifierIds: [], note: "", serviceType: "TAKEAWAY" as const });

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

describe("historial y cierre de caja", () => {
  it("filtra el historial del día y arma el cierre con arqueo", async () => {
    await seed(db);
  await seedTestCatalog(db);
    const caja = await db.user.findUniqueOrThrow({ where: { username: "caja" } });
    const plato = await db.product.findFirstOrThrow({ where: { name: "Majadito (ejemplo)" } });
    const gaseosa = await db.product.findFirstOrThrow({ where: { name: "Gaseosa 500 ml (ejemplo)" } });
    const today = businessDate();

    const a = await orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(plato.id), line(gaseosa.id)], caja.id);
    await checkout.payOrder(a.id, { discount: null, entries: [{ method: "CASH", amountCents: 5000 }] }, caja.id);
    const b = await orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(plato.id)], caja.id);
    await checkout.payOrder(
      b.id,
      { discount: null, entries: [{ method: "CREDIT", amountCents: 3800 }], customerName: "Ana" },
      caja.id,
    );
    const [debt] = await checkout.listOpenReceivables();
    await checkout.collectCredit(debt.paymentId, { method: "CASH", amountCents: 1000 }, caja.id);
    await orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(gaseosa.id)], caja.id); // queda por pagar

    expect(await history.listOrdersForDay(today)).toHaveLength(3);
    expect((await history.listOrdersForDay(today, { method: "CREDIT" })).map((o) => o.number)).toEqual([2]);
    expect((await history.listOrdersForDay(today, { status: "OPEN" })).map((o) => o.number)).toEqual([3]);

    const { summary } = await history.getDailyClosing(today);
    expect(summary).toMatchObject({ paidCount: 2, netCents: 8600, openCount: 1, openTotalCents: 1000 });
    // efectivo: 48 de la venta + 10 cobrados del fiado
    expect(summary.moneyInByMethod.CASH).toBe(5800);

    // Apertura: una sola vez, no editable
    await history.openCash(today, { openingCashCents: 20000 }, caja.id);
    await expect(history.openCash(today, { openingCashCents: 50000 }, caja.id)).rejects.toThrow("ya se abrió");
    expect((await history.getOpening(today))?.openingCashCents).toBe(20000);

    const saved = await history.saveClosing(today, { countedCashCents: 25500 }, caja.id);
    // el fondo del cierre sale de la apertura
    expect(saved).toMatchObject({ openingCashCents: 20000, expectedCashCents: 25800, differenceCents: -300 });
    // se puede corregir el mismo día
    const fixed = await history.saveClosing(
      today,
      { countedCashCents: 25800, countedQrCents: 0, countedCardCents: null },
      caja.id,
    );
    expect(fixed).toMatchObject({ differenceCents: 0, expectedQrCents: 0, countedQrCents: 0, countedCardCents: null });
    expect(await db.cashClosing.count()).toBe(1);
  });
});
