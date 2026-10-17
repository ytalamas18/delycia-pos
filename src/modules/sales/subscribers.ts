import { eventBus } from "@/core/db/transaction";

import { reconcileClosure } from "./services/checkout";

/** Ventas escucha a Cocina: cuando cambia una comanda, revisa si la orden ya se puede cerrar. */
export function registerSalesSubscribers() {
  eventBus.onTransaction("ticket.status_changed", async ({ payload }, tx, publish) => {
    await reconcileClosure(tx, publish, payload.orderId);
  });
}
