import { eventBus } from "@/core/db/transaction";
import { realtimeHub } from "@/core/realtime/hub";

import { modules } from "./modules";

const globalForBoot = globalThis as unknown as { delyciaBooted?: boolean };

/**
 * Arranque del servidor (lo llama src/instrumentation.ts una vez):
 *  1. cada módulo activo registra sus suscriptores de eventos,
 *  2. todo evento confirmado se empuja a las pantallas por SSE.
 */
export function bootstrap() {
  if (globalForBoot.delyciaBooted) return;
  globalForBoot.delyciaBooted = true;

  modules.registerAllSubscribers();
  eventBus.onAnyAfterCommit((event) => realtimeHub.broadcast(event));
}
