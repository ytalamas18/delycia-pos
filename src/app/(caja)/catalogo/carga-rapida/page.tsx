import { BulkItemsEditor, CatalogTabs, listCategories } from "@/modules/catalog";

export default async function CargaRapidaPage() {
  const categories = await listCategories();
  return (
    <>
      <h1 className="text-2xl font-bold">Catálogo</h1>
      <CatalogTabs active="/catalogo/carga-rapida" />
      <p className="text-sm text-muted-foreground">
        Para la puesta en marcha: carga muchos ítems de una vez escribiéndolos aquí o importando la plantilla de Excel.
      </p>
      <BulkItemsEditor categories={categories.map((c) => c.name)} />
    </>
  );
}
