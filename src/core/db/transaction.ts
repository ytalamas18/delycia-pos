import type { Prisma } from "@/generated/prisma/client";

import { EventBus, type EventStore } from "../events/bus";
import type { DomainEventMap, DomainEventType, StoredDomainEvent } from "../events/types";
import { db } from "./client";

export type Tx = Prisma.TransactionClient;

/** Guarda cada evento en la tabla DomainEvent (outbox), dentro de la misma transacción. */
const prismaEventStore: EventStore<Tx> = {
  async append(tx, event) {
    const row = await tx.domainEvent.create({
      data: { type: event.type, payload: event.payload as Prisma.InputJsonValue },
    });
    return { ...event, id: Number(row.id), createdAt: row.createdAt };
  },
};

const globalForBus = globalThis as unknown as { eventBus?: EventBus<Tx> };

/** Bus único del proceso (compartido entre los bundles de Next mediante globalThis). */
export const eventBus = (globalForBus.eventBus ??= new EventBus<Tx>(prismaEventStore));

export type Publish = <T extends DomainEventType>(
  type: T,
  payload: DomainEventMap[T],
) => Promise<StoredDomainEvent<T>>;

/**
 * Corre `fn` en una transacción. Los eventos publicados dentro:
 *  - se guardan en DomainEvent y ejecutan sus handlers "transaction" (todo o nada),
 *  - y, tras el commit, se despachan a los handlers "afterCommit" (SSE, etc.).
 */
export async function runInTransaction<T>(fn: (tx: Tx, publish: Publish) => Promise<T>): Promise<T> {
  let pending: StoredDomainEvent[] = [];
  const result = await db.$transaction(async (tx) => {
    const publisher = eventBus.createPublisher(tx);
    pending = publisher.pending;
    return fn(tx, publisher.publish as Publish);
  });
  await eventBus.dispatchAfterCommit(pending);
  return result;
}
