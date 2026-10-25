// API pública del módulo Inventario. Otros módulos y la app solo importan desde aquí.
export { inventoryModule } from "./module";
export { MOVEMENT_LABEL, STOCK_LEVEL_LABEL, type StockLevel } from "./domain/labels";
export { stockLevel, withRunningBalance } from "./domain/stock";
export { itemMovements, listStockItems, stockAlerts, stockByProduct, type StockItem } from "./services/stock";
export { InventoryNav } from "./components/inventory-nav";
export { StockTable } from "./components/stock-table";
export { Kardex } from "./components/kardex";
export { ConsumptionForm, CountForm, ProductionForm } from "./components/forms";
export { StockAlertLink } from "./components/stock-alert-link";
export { consumptionFormData, countFormData, productionFormData } from "./services/form-data";
export { listProductions } from "./services/operations";
