import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, disconnectDb } from "@/core/db/client";
import { eventBus } from "@/core/db/transaction";

import * as messages from "@/modules/kitchen/services/messages";

import { resetDatabase } from "../support/db";

const caja = { userId: "u-caja", name: "Caja" };
const cocina = { userId: "u-cocina", name: "Cocina" };

beforeEach(async () => {
  eventBus.reset();
  await resetDatabase();
});
afterAll(disconnectDb);

describe("mensajes de caja a cocina", () => {
  it("se envía, queda pendiente hasta que cocina lo marca visto y avisa a caja", async () => {
    const m = await messages.sendKitchenMessage("  más   papa ", caja);
    expect(m.text).toBe("más papa");
    expect((await messages.listPendingMessages()).map((x) => x.text)).toEqual(["más papa"]);

    await messages.acknowledgeKitchenMessage(m.id, cocina);
    await messages.acknowledgeKitchenMessage(m.id, cocina); // doble toque: no falla ni duplica
    expect(await messages.listPendingMessages()).toEqual([]);

    const events = await db.domainEvent.findMany({ orderBy: { id: "asc" } });
    expect(events.map((e) => e.type)).toEqual(["kitchen.message_sent", "kitchen.message_seen"]);
    expect(events[1].payload).toMatchObject({ text: "más papa", seenBy: "Cocina" });
  });

  it("rechaza mensajes vacíos o demasiado largos", async () => {
    await expect(messages.sendKitchenMessage("   ", caja)).rejects.toThrow("Escribe el mensaje");
    await expect(messages.sendKitchenMessage("x".repeat(81), caja)).rejects.toThrow("Máximo 80");
  });
});
