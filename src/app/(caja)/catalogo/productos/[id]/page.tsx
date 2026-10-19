import Link from "next/link";
import { notFound } from "next/navigation";

import { formatMoneyInput } from "@/core/money";
import { formatQuantity } from "@/core/quantity";
import {
  formatUnitCostInput,
  getProduct,
  hasRecipeTab,
  isSellable,
  listCategories,
  ModifierEditor,
  PresentationEditor,
  ProductTabs,
  ProductForm,
} from "@/modules/catalog";

export default async function EditarProductoPage({ params, searchParams }: PageProps<"/catalogo/productos/[id]">) {
  const { id } = await params;
  const { nuevo } = await searchParams;
  const [product, categories] = await Promise.all([getProduct(id), listCategories()]);
  if (!product) notFound();

  const price = product.priceCents > 0 ? formatMoneyInput(product.priceCents) : "";

  return (
    <>
      <Link href="/catalogo" className="text-sm text-muted-foreground hover:underline">
        ← Volver al catálogo
      </Link>
      <h1 className="text-2xl font-bold">{product.name}</h1>
      <ProductTabs id={product.id} active="datos" showRecipe={hasRecipeTab(product)} />
      {nuevo && <p className="font-medium text-green-700 dark:text-green-400">Ítem creado. Si quieres, completa abajo modificadores o presentaciones de compra.</p>}
      <ProductForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        product={{
          id: product.id,
          name: product.name,
          categoryId: product.categoryId,
          type: product.type,
          price,
          sendsToKitchen: product.sendsToKitchen,
          active: product.active,
          baseUnit: product.baseUnit,
          tracksStock: product.tracksStock,
          minStock: product.minStock ? formatQuantity(product.minStock) : "",
          lastCost: product.lastCostCents ? formatUnitCostInput(product.lastCostCents) : "",
        }}
      />
      {isSellable(product.type) && (
        <>
          <h2 className="pt-4 text-xl font-semibold">Modificadores</h2>
          <ModifierEditor productId={product.id} modifiers={product.modifiers} />
        </>
      )}
      {product.type !== "PREPARED" && (
        <>
          <h2 className="pt-4 text-xl font-semibold">Presentaciones de compra</h2>
          <PresentationEditor
            productId={product.id}
            baseUnit={product.baseUnit}
            presentations={product.presentations.map((p) => ({ id: p.id, name: p.name, factor: formatQuantity(p.factor) }))}
          />
        </>
      )}
    </>
  );
}
