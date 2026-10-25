/** Eventos que emite Catálogo. Inventario escucha la carga rápida para registrar el inventario inicial. */
declare module "@/core/events/types" {
  interface DomainEventMap {
    "catalog.items_imported": {
      items: { productId: string; initialQuantity: string; unitCostCents: string | null }[];
    };
  }
}

export {};
