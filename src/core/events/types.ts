/**
 * Catálogo de eventos de dominio.
 *
 * Cada módulo AGREGA sus eventos a esta interfaz desde su propio `events.ts`
 * (declaration merging), así `core` no conoce a ningún módulo:
 *
 *   declare module "@/core/events/types" {
 *     interface DomainEventMap {
 *       "order.sent_to_kitchen": { orderId: string; ... };
 *     }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DomainEventMap {}

export type DomainEventType = keyof DomainEventMap;

export type DomainEvent<T extends DomainEventType = DomainEventType> = {
  type: T;
  payload: DomainEventMap[T];
};

/** Evento ya guardado: tiene id secuencial (sirve como Last-Event-ID en SSE). */
export type StoredDomainEvent<T extends DomainEventType = DomainEventType> = DomainEvent<T> & {
  id: number;
  createdAt: Date;
};
