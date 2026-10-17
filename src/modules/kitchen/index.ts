// API pública del módulo Cocina. Otros módulos y la app solo importan desde aquí.
import "./events";

export { kitchenModule } from "./module";
export { ticketStatusLabel } from "./domain/labels";
export { kdsThresholdsSetting } from "./settings";
export { getTicket, kitchenSummaryByOrder, listActiveTickets, listRecentTickets } from "./services/tickets";
export { KdsThresholdsForm } from "./components/kds-thresholds-form";
export { getKdsSnapshot, type KdsSnapshot, type KdsTicket } from "./services/snapshot";
export { KdsBoard } from "./components/kds-board";
