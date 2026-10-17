import { CatalogTabs, CategoryManager, listCategories } from "@/modules/catalog";

export default async function CategoriasPage() {
  const categories = await listCategories();
  return (
    <>
      <h1 className="text-2xl font-bold">Catálogo</h1>
      <CatalogTabs active="/catalogo/categorias" />
      <p className="text-sm text-muted-foreground">
        Toca un nombre para renombrarlo. El orden es el mismo que verá el cajero en la pantalla de venta.
      </p>
      <CategoryManager
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          active: c.active,
          productCount: c._count.products,
        }))}
      />
    </>
  );
}
