import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, disconnectDb } from "@/core/db/client";
import { eventBus, runInTransaction } from "@/core/db/transaction";

import { resetDatabase } from "../support/db";

declare module "@/core/events/types" {
  interface DomainEventMap {
    "test.setting_touched": { key: string };
  }
}

describe("runInTransaction + eventos (Postgres real)", () => {
  beforeEach(async () => {
    eventBus.reset();
    await resetDatabase();
  });
  afterAll(async () => {
    eventBus.reset();
    await disconnectDb();
  });

  it("guarda el evento y lo que hace el handler en la misma transacción", async () => {
    eventBus.onTransaction("test.setting_touched", async (event, tx) => {
      await tx.setting.create({ data: { key: event.payload.key, value: true } });
    });
    const seenAfterCommit: number[] = [];
    eventBus.onAnyAfterCommit((e) => {
      seenAfterCommit.push(e.id);
    });

    await runInTransaction(async (_tx, publish) => {
      await publish("test.setting_touched", { key: "a" });
    });

    expect(await db.setting.count()).toBe(1);
    const events = await db.domainEvent.findMany();
    expect(events.map((e) => e.type)).toEqual(["test.setting_touched"]);
    expect(seenAfterCommit).toEqual([Number(events[0].id)]);
  });

  it("si un handler falla, se revierte TODO (incluido el evento) y no se avisa a las pantallas", async () => {
    eventBus.onTransaction("test.setting_touched", () => {
      throw new Error("cocina caída");
    });
    let notified = false;
    eventBus.onAnyAfterCommit(() => {
      notified = true;
    });

    await expect(
      runInTransaction(async (tx, publish) => {
        await tx.setting.create({ data: { key: "antes", value: 1 } });
        await publish("test.setting_touched", { key: "b" });
      }),
    ).rejects.toThrow("cocina caída");

    expect(await db.setting.count()).toBe(0);
    expect(await db.domainEvent.count()).toBe(0);
    expect(notified).toBe(false);
  });
});
