import Link from "next/link";

import { listCategories, ProductForm } from "@/modules/catalog";

export default async function NuevoProductoPage() {
  const categories = await listCategories();
  return (
    <>
      <Link href="/catalogo" className="text-sm text-muted-foreground hover:underline">
        ← Volver al catálogo
      </Link>
      <h1 className="text-2xl font-bold">Nuevo producto</h1>
      {categories.length === 0 ? (
        <p>
          Primero crea una categoría en{" "}
          <Link href="/catalogo/categorias" className="underline">
            Categorías
          </Link>
          .
        </p>
      ) : (
        <ProductForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
      )}
    </>
  );
}
