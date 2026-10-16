import { describe, expect, it } from "vitest";

import { EventBus, type EventStore } from "@/core/events/bus";
import type { DomainEvent, StoredDomainEvent } from "@/core/events/types";

declare module "@/core/events/types" {
  interface DomainEventMap {
    "test.happened": { value: number };
  }
}

type FakeTx = { log: string[] };

function memoryStore(): EventStore<FakeTx> & { saved: StoredDomainEvent[] } {
  const saved: StoredDomainEvent[] = [];
  return {
    saved,
    async append(_tx, event: DomainEvent) {
      const stored = { ...event, id: saved.length + 1, createdAt: new Date() };
      saved.push(stored);
      return stored;
    },
  };
}

describe("EventBus", () => {
  it("guarda el evento y ejecuta los handlers de transacción con la misma tx", async () => {
    const store = memoryStore();
    const bus = new EventBus<FakeTx>(store);
    bus.onTransaction("test.happened", (event, tx) => {
      tx.log.push(`tx:${event.payload.value}`);
    });

    const tx: FakeTx = { log: [] };
    const { publish, pending } = bus.createPublisher(tx);
    await publish("test.happened", { value: 7 });

    expect(tx.log).toEqual(["tx:7"]);
    expect(store.saved).toHaveLength(1);
    expect(pending.map((e) => e.id)).toEqual([1]);
  });

  it("si un handler de transacción falla, el error sube (para revertir la tx)", async () => {
    const bus = new EventBus<FakeTx>(memoryStore());
    bus.onTransaction("test.happened", () => {
      throw new Error("boom");
    });
    const { publish } = bus.createPublisher({ log: [] });
    await expect(publish("test.happened", { value: 1 })).rejects.toThrow("boom");
  });

  it("después del commit, un handler que falla no frena a los demás", async () => {
    const bus = new EventBus<FakeTx>(memoryStore());
    const seen: string[] = [];
    bus.onAfterCommit("test.happened", () => {
      throw new Error("falla");
    });
    bus.onAnyAfterCommit((e) => {
      seen.push(e.type);
    });

    const { publish, pending } = bus.createPublisher({ log: [] });
    await publish("test.happened", { value: 1 });
    const original = console.error;
    console.error = () => {};
    await bus.dispatchAfterCommit(pending);
    console.error = original;

    expect(seen).toEqual(["test.happened"]);
  });
});
