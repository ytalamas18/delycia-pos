// API pública del módulo Ventas. Otros módulos solo pueden importar desde aquí.
export { salesModule } from "./module";
export { unitPriceFor, type ModifierSnapshot } from "./domain/pricing";
export { paymentMethodLabel, channelLabel, serviceTypeLabel, orderStatusLabel } from "./domain/labels";
export { peyaMarkupSetting } from "./settings";
export { PeyaMarkupForm } from "./components/peya-markup-form";
