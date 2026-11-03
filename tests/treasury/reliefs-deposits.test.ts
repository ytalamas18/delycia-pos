import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, disconnectDb } from "@/core/db/client";
import { eventBus } from "@/core/db/transaction";
import { addDays, businessDate } from "@/core/time";
import { getCashbook } from "@/modules/reports/services/cashbook";
import * as history from "@/modules/sales/services/history";
import * as deposits from "@/modules/treasury/services/deposits";
import * as withdrawals from "@/modules/treasury/services/withdrawals";

import { resetDatabase } from "../support/db";
import { createTestUser } from "../support/users";

const today = businessDate();
const yesterday = addDays(today, -1);

afterAll(async () => {
  eventBus.reset();
  await disconnectDb();
});

async function setup() {
  const admin = await createTestUser(db, { name: "Yasser", username: "yasser" });
  const harumi = await createTestUser(db, { name: "Harumi", username: "harumi", systemRole: "CASHIER" });
  return { admin, harumi };
}

describe("alivios y depósitos al banco", () => {
  beforeEach(async () => {
    eventBus.reset();
    await resetDatabase();
  });

  it("un alivio exige quién lo lleva (usuario activo), resta del cierre y queda pendiente de depositar", async () => {
    const { admin, harumi } = await setup();
    await expect(withdrawals.createWithdrawal({ amountCents: 100, kind: "RELIEF" }, harumi.id)).rejects.toThrow("quién se lleva");
    await db.user.update({ where: { id: admin.id }, data: { active: false } });
    await expect(withdrawals.createWithdrawal({ amountCents: 100, kind: "RELIEF", carriedById: admin.id }, harumi.id)).rejects.toThrow(
      "usuario activo",
    );
    await db.user.update({ where: { id: admin.id }, data: { active: true } });

    await history.openCash(today, { openingCashCents: 10000 }, harumi.id);
    await withdrawals.createWithdrawal({ amountCents: 30000, kind: "RELIEF", carriedById: harumi.id }, harumi.id);
    await withdrawals.createWithdrawal({ amountCents: 5000, reason: "Gasto personal" }, admin.id); // retiro del dueño

    const { summary } = await history.getDailyClosing(today);
    expect(summary.withdrawals?.totalCents).toBe(35000);
    expect(summary.withdrawals?.items[0]).toMatchObject({ kind: "RELIEF", carriedByName: "Harumi", reason: "Alivio" });
    expect((await withdrawals.listPendingReliefs()).map((r) => r.amountCents)).toEqual([30000]);
  });

  it("depósito de varios alivios: pasan de Por depositar a Banco; con diferencia exige motivo; anular los devuelve", async () => {
    const { admin, harumi } = await setup();
    const a = await withdrawals.createWithdrawal({ amountCents: 30000, kind: "RELIEF", carriedById: harumi.id }, harumi.id, yesterday);
    const b = await withdrawals.createWithdrawal({ amountCents: 20000, kind: "RELIEF", carriedById: admin.id, reason: "fin de turno" }, harumi.id);
    const owner = await withdrawals.createWithdrawal({ amountCents: 1000, reason: "Dueño" }, admin.id);

    await expect(deposits.createDeposit({ date: today, amountCents: 1000, withdrawalIds: [owner.id] }, admin.id)).rejects.toThrow("Solo se depositan alivios");
    await expect(deposits.createDeposit({ date: yesterday, amountCents: 50000, withdrawalIds: [a.id, b.id] }, admin.id)).rejects.toThrow(
      "anterior a la del alivio",
    );
    await expect(deposits.createDeposit({ date: today, amountCents: 49000, withdrawalIds: [a.id, b.id] }, admin.id)).rejects.toThrow(
      "motivo de la diferencia",
    );
    const dep = await deposits.createDeposit(
      { date: today, amountCents: 49000, withdrawalIds: [a.id, b.id], reference: "DEP-77", differenceReason: "faltó un billete" },
      admin.id,
    );
    expect(dep.differenceCents).toBe(-1000);
    expect(await withdrawals.listPendingReliefs()).toEqual([]);
    // Ya depositado: no se puede usar en otro depósito ni anular el alivio.
    await expect(deposits.createDeposit({ date: today, amountCents: 20000, withdrawalIds: [b.id] }, admin.id)).rejects.toThrow("ya se depositó");
    await expect(withdrawals.voidWithdrawal(b.id, "error", harumi.id)).rejects.toThrow("primero anula el depósito");

    const book = await getCashbook({ from: yesterday, to: today });
    const end = Object.fromEntries(book.accounts.map((x) => [x.account, x.endCents]));
    // Efectivo: −300 −200 −10 (sin cierres guardados); Por depositar: +500 −490 −10 = 0; Banco: +490.
    expect(end).toEqual({ CASH: -51000, PENDING_DEPOSIT: 0, BANK: 49000, ATC_PEYA: 0 });
    expect(book.lines.find((l) => l.kind === "DEPOSIT_DIFFERENCE")).toMatchObject({ account: "PENDING_DEPOSIT", amountCents: -1000 });
    expect(book.lines.find((l) => l.kind === "DEPOSIT" && l.account === "BANK")).toMatchObject({ amountCents: 49000, reference: "DEP-77" });
    expect(book.lines.find((l) => l.kind === "WITHDRAWAL")?.detail).toContain("Retiro del dueño");

    const [listed] = await deposits.listDeposits({ from: today, to: today });
    expect(listed.reliefs.map((r) => r.carriedByName)).toEqual(["Harumi", "Yasser"]);

    await deposits.voidDeposit(dep.id, "Se cargó mal", admin.id);
    expect((await withdrawals.listPendingReliefs()).map((r) => r.id)).toEqual([a.id, b.id]);
    const after = await getCashbook({ from: today, to: today }, "PENDING_DEPOSIT");
    expect(after.accounts[0].endCents).toBe(50000);
    const again = await deposits.createDeposit({ date: today, amountCents: 50000, withdrawalIds: [a.id, b.id] }, admin.id);
    expect(again.differenceCents).toBe(0);
  });
});
