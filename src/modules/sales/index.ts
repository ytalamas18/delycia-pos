// API pública del módulo Ventas. Otros módulos y la app solo importan desde aquí.
import "./events";

export { salesModule } from "./module";
export { unitPriceFor, type ModifierSnapshot } from "./domain/pricing";
export {
  paymentMethodLabel,
  channelLabel,
  serviceTypeLabel,
  orderStatusLabel,
  orderLabel,
} from "./domain/labels";
export { peyaMarkupSetting } from "./settings";
export { salesAbilities, type SalesAbilities } from "./domain/abilities";
export type { OrderItemSnapshot } from "./events";

// Servicios de lectura para las páginas
export { getOrder, listOpenOrders } from "./services/orders";

// Componentes
export { PeyaMarkupForm } from "./components/peya-markup-form";
export { PosScreen } from "./components/pos-screen";
export { OpenOrders, PaidInProgress } from "./components/open-orders";
export { ReadyNotifier } from "./components/ready-notifier";
export { Receivables } from "./components/receivables";
export { HistoryList } from "./components/history-list";
export { OrderDetail } from "./components/order-detail";
export { ClosingView } from "./components/closing-view";
export { OpeningForm } from "./components/opening-form";
export { getDailyClosing, getOpening } from "./services/history";
export { getClosingReport } from "./reports";
export { buildHistoryExport } from "./reports/history-export";
export type { PosCategory, PosOrder, PosProduct } from "./components/pos-types";
