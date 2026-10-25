// API pública del módulo Compras. Otros módulos y la app solo importan desde aquí.
import "./events";

export { purchasesModule } from "./module";
export { DOC_TYPE_LABEL, PAYMENT_STATUS_LABEL, SUPPLIER_METHOD_LABEL, type PaymentStatus } from "./domain/labels";
export { purchaseBalance, isOverdue } from "./domain/balance";
export { getSupplier, listSuppliers } from "./services/suppliers";
export {
  getPurchase,
  listPayables,
  listPurchases,
  supplierPaymentsForDay,
  type SupplierPaymentsForDay,
} from "./services/purchases";
export { getPurchaseFormData } from "./services/form-data";
export { PurchasesNav } from "./components/purchases-nav";
export { PurchaseList } from "./components/purchase-list";
export { PurchaseDetail } from "./components/purchase-detail";
export { PurchaseForm } from "./components/purchase-form";
export { PayablesView } from "./components/payables-view";
export { SupplierForm } from "./components/supplier-form";
