// API pública del módulo Catálogo. Otros módulos y la app solo importan desde aquí.
export { catalogModule } from "./module";

// Para Ventas (pantalla POS)
export {
  getSellableCatalog,
  getSellableProduct,
  type SellableCategory,
  type SellableProduct,
} from "./services/sellable";

// Para las páginas de administración
export { listCategories } from "./services/categories";
export { getProduct } from "./services/products";
export { CatalogTabs } from "./components/catalog-tabs";
export { CategoryManager } from "./components/category-manager";
export { ModifierEditor } from "./components/modifier-editor";
export { PresentationEditor } from "./components/presentation-editor";
export { RecipeSection } from "./components/recipe-section";
export { hasRecipeTab, ProductTabs } from "./components/product-tabs";
export { ProductForm } from "./components/product-form";
export { PRODUCT_LIST_FILTERS, ProductList, type ProductListFilter, type ProductListGroup } from "./components/product-list";

// Tipos de ítem, unidades y costos (los usan Compras, Inventario y Reportes)
export {
  ITEM_TYPE_LABEL,
  ITEM_TYPES,
  isSellable,
  PURCHASABLE_TYPES,
  SELLABLE_TYPES,
  tracksStockFor,
  type ItemType,
} from "./domain/item-types";
export { BASE_UNITS, compatibleUnits, toBaseQuantity, UNIT_LABEL, UNIT_SHORT, unitFactor, type BaseUnit } from "./domain/units";
export { formatUnitCost, formatUnitCostInput, parseUnitCost } from "./domain/costs";
export { RECIPE_CONDITION_LABEL, type RecipeCondition } from "./domain/recipe-conditions";
export { stockConsumption, type SoldItem } from "./domain/recipes";
export { getPurchasableItem, listPurchasableItems, setLastCost, type PurchasableItem } from "./services/purchasable";
