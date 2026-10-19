import Link from "next/link";
import { notFound } from "next/navigation";

import { getProduct, hasRecipeTab, ProductTabs, RecipeSection } from "@/modules/catalog";

export default async function RecetaPage({ params }: PageProps<"/catalogo/productos/[id]/receta">) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  return (
    <>
      <Link href="/catalogo" className="text-sm text-muted-foreground hover:underline">
        ← Volver al catálogo
      </Link>
      <h1 className="text-2xl font-bold">{product.name}</h1>
      <ProductTabs id={product.id} active="receta" showRecipe />
      {hasRecipeTab(product) ? (
        <RecipeSection productId={product.id} baseUnit={product.baseUnit} />
      ) : (
        <p className="text-muted-foreground">Este ítem no lleva receta.</p>
      )}
    </>
  );
}
