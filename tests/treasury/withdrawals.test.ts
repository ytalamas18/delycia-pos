import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { effectivePermissions } from "@/core/auth/permissions";
import { db, disconnectDb } from "@/core/db/client";
import { eventBus } from "@/core/db/transaction";
import { addDays, businessDate } from "@/core/time";
import * as history from "@/modules/sales/services/history";
import * as withdrawals from "@/modules/treasury/services/withdrawals";

import { resetDatabase } from "../support/db";
import { createTestUser } from "../support/users";

const today = businessDate();

afterAll(async () => {
  eventBus.reset();
  await disconnectDb();
});

describe("retiros de efectivo", () => {
  beforeEach(async () => {
    eventBus.reset();
    await resetDatabase();
  });

  it("Caja tiene el permiso de retiros por defecto", async () => {
    await createTestUser(db, { name: "Caja", systemRole: "CASHIER" });
    const role = await db.role.findUniqueOrThrow({ where: { systemKey: "CASHIER" } });
    expect(effectivePermissions(role)).toContain("cash.withdraw");
  });

  it("exige monto mayor a 0 y motivo", async () => {
    const user = await createTestUser(db, { name: "Caja", systemRole: "CASHIER" });
    await expect(withdrawals.createWithdrawal({ amountCents: 0, reason: "x" }, user.id)).rejects.toThrow("mayor a 0");
    await expect(withdrawals.createWithdrawal({ amountCents: 100, reason: "  " }, user.id)).rejects.toThrow("motivo");
  });

  it("restan del efectivo esperado del cierre; anulados quedan aparte y no restan", async () => {
    const user = await createTestUser(db, { name: "Caja", systemRole: "CASHIER" });
    await history.openCash(today, { openingCashCents: 50000 }, user.id);
    const a = await withdrawals.createWithdrawal({ amountCents: 20000, reason: "Retiro del dueño" }, user.id);
    await withdrawals.createWithdrawal({ amountCents: 5000, reason: "Cambio" }, user.id);
    await withdrawals.voidWithdrawal(a.id, "Se registró dos veces", user.id);
    await expect(withdrawals.voidWithdrawal(a.id, "otra vez", user.id)).rejects.toThrow("ya está anulado");

    const { summary } = await history.getDailyClosing(today);
    expect(summary.withdrawals?.totalCents).toBe(5000);
    expect(summary.withdrawals?.items.map((w) => [w.reason, w.byName])).toEqual([["Cambio", "Caja"]]);
    expect(summary.withdrawals?.voided).toMatchObject([{ reason: "Retiro del dueño", voidReason: "Se registró dos veces", voidedByName: "Caja" }]);

    const saved = await history.saveClosing(today, { countedCashCents: 45000 }, user.id);
    expect(saved).toMatchObject({ expectedCashCents: 45000, differenceCents: 0 });
    // El resumen guardado conserva el detalle de los retiros.
    expect((saved.summary as { withdrawals: { totalCents: number } }).withdrawals.totalCents).toBe(5000);
    expect(await db.domainEvent.count({ where: { type: "cash.withdrawal_changed" } })).toBe(3);
  });

  it("no se anula un retiro de otro día", async () => {
    const user = await createTestUser(db, { name: "Caja", systemRole: "CASHIER" });
    const old = await withdrawals.createWithdrawal({ amountCents: 1000, reason: "Ayer" }, user.id, addDays(today, -1));
    await expect(withdrawals.voidWithdrawal(old.id, "error", user.id)).rejects.toThrow("del día de hoy");
  });
});
