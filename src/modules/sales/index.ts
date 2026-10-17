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
export type { OrderItemSnapshot } from "./events";

// Servicios de lectura para las páginas
export { getOrder, listOpenOrders } from "./services/orders";

// Componentes
export { PeyaMarkupForm } from "./components/peya-markup-form";
export { PosScreen } from "./components/pos-screen";
export { OpenOrders } from "./components/open-orders";
export type { PosCategory, PosOrder, PosProduct } from "./components/pos-types";
