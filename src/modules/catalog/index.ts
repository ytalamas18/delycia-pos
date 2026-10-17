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
export { ProductForm } from "./components/product-form";
export { ProductList } from "./components/product-list";
