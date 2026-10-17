import type { DomainEvent, DomainEventMap, DomainEventType, StoredDomainEvent } from "./types";

/**
 * Bus de eventos de dominio con dos fases:
 *
 *  - "transaction": el handler corre DENTRO de la misma transacción que emitió
 *    el evento. Si falla, se revierte todo. Úsalo para mantener consistencia
 *    entre módulos (ej. Cocina crea la comanda cuando Ventas envía la orden).
 *
 *  - "afterCommit": corre cuando la transacción ya se confirmó. Úsalo para
 *    efectos que no deben revertir nada (empujar a pantallas por SSE, logs).
 *
 * `Tx` es genérico para no acoplar `core` a Prisma en los tests.
 */
export type EventPhase = "transaction" | "afterCommit";

export type PublishFn = <T extends DomainEventType>(
  type: T,
  payload: DomainEventMap[T],
) => Promise<StoredDomainEvent<T>>;

/** Recibe la misma transacción y puede publicar nuevos eventos dentro de ella. */
export type TxHandler<T extends DomainEventType, Tx> = (
  event: StoredDomainEvent<T>,
  tx: Tx,
  publish: PublishFn,
) => Promise<void> | void;

export type AfterCommitHandler<T extends DomainEventType> = (
  event: StoredDomainEvent<T>,
) => Promise<void> | void;

/** Persistencia de eventos (outbox). La implementación real usa la tabla DomainEvent. */
export interface EventStore<Tx> {
  append(tx: Tx, event: DomainEvent): Promise<StoredDomainEvent>;
}

type AnyTxHandler<Tx> = TxHandler<DomainEventType, Tx>;
type AnyAfterHandler = AfterCommitHandler<DomainEventType>;

export class EventBus<Tx> {
  private txHandlers = new Map<DomainEventType, AnyTxHandler<Tx>[]>();
  private afterHandlers = new Map<DomainEventType, AnyAfterHandler[]>();
  /** Handlers que reciben TODOS los eventos tras el commit (ej. el hub SSE). */
  private afterAnyHandlers: AnyAfterHandler[] = [];

  constructor(private store: EventStore<Tx>) {}

  onTransaction<T extends DomainEventType>(type: T, handler: TxHandler<T, Tx>) {
    const list = this.txHandlers.get(type) ?? [];
    list.push(handler as AnyTxHandler<Tx>);
    this.txHandlers.set(type, list);
  }

  onAfterCommit<T extends DomainEventType>(type: T, handler: AfterCommitHandler<T>) {
    const list = this.afterHandlers.get(type) ?? [];
    list.push(handler as AnyAfterHandler);
    this.afterHandlers.set(type, list);
  }

  onAnyAfterCommit(handler: AnyAfterHandler) {
    this.afterAnyHandlers.push(handler);
  }

  /** Quita todos los handlers (útil en tests y en recargas en desarrollo). */
  reset() {
    this.txHandlers.clear();
    this.afterHandlers.clear();
    this.afterAnyHandlers = [];
  }

  /**
   * Crea un "publicador" atado a una transacción. Los servicios lo usan así:
   *
   *   await runInTransaction(async (tx, events) => {
   *     ...cambios...
   *     await events.publish("order.sent_to_kitchen", { ... });
   *   });
   */
  createPublisher(tx: Tx) {
    const pending: StoredDomainEvent[] = [];
    const publish: PublishFn = async (type, payload) => {
      const stored = await this.store.append(tx, { type, payload } as DomainEvent);
      pending.push(stored);
      for (const handler of this.txHandlers.get(type) ?? []) {
        await handler(stored, tx, publish);
      }
      return stored as StoredDomainEvent<typeof type>;
    };
    return { publish, pending };
  }

  /** Se llama tras el commit. Un handler que falla no afecta a los demás. */
  async dispatchAfterCommit(events: StoredDomainEvent[]) {
    for (const event of events) {
      const handlers = [...(this.afterHandlers.get(event.type) ?? []), ...this.afterAnyHandlers];
      for (const handler of handlers) {
        try {
          await handler(event);
        } catch (error) {
          console.error(`[eventos] handler afterCommit de "${event.type}" falló`, error);
        }
      }
    }
  }
}

