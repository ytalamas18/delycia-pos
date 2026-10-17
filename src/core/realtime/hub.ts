import type { StoredDomainEvent } from "../events/types";

/**
 * Hub de tiempo real: guarda las conexiones SSE abiertas (pantallas de caja y cocina)
 * y les reenvía cada evento de dominio ya confirmado.
 *
 * Vive en memoria del proceso: alcanza para un local con un solo servidor.
 * Con varias instancias se cambiaría por Postgres LISTEN/NOTIFY sin tocar los módulos.
 */
type Client = { id: number; send: (chunk: string) => void };

class RealtimeHub {
  private clients = new Map<number, Client>();
  private nextId = 1;

  add(send: (chunk: string) => void): () => void {
    const id = this.nextId++;
    this.clients.set(id, { id, send });
    return () => this.clients.delete(id);
  }

  get size() {
    return this.clients.size;
  }

  broadcast(event: StoredDomainEvent) {
    const chunk = formatSse(event.id, "domain", { type: event.type, payload: event.payload });
    for (const client of this.clients.values()) {
      try {
        client.send(chunk);
      } catch {
        this.clients.delete(client.id); // conexión muerta
      }
    }
  }
}

export function formatSse(id: number | null, event: string, data: unknown): string {
  return `${id !== null ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const globalForHub = globalThis as unknown as { realtimeHub?: RealtimeHub };
export const realtimeHub = (globalForHub.realtimeHub ??= new RealtimeHub());
