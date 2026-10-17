import Link from "next/link";
import { notFound } from "next/navigation";

import { appConfig } from "@/core/config/app";
import { getProduct, listCategories, ModifierEditor, ProductForm } from "@/modules/catalog";

export default async function EditarProductoPage({ params, searchParams }: PageProps<"/catalogo/productos/[id]">) {
  const { id } = await params;
  const { nuevo } = await searchParams;
  const [product, categories] = await Promise.all([getProduct(id), listCategories()]);
  if (!product) notFound();

  // El formulario muestra el precio en Bs, como lo escribiría el usuario: 3800 → "38", 3850 → "38,50"
  const { decimals } = appConfig.currency;
  const price = (product.priceCents / 10 ** decimals).toFixed(decimals).replace(".", ",").replace(/,0+$/, "");

  return (
    <>
      <Link href="/catalogo" className="text-sm text-muted-foreground hover:underline">
        ← Volver al catálogo
      </Link>
      <h1 className="text-2xl font-bold">{product.name}</h1>
      {nuevo && <p className="font-medium text-green-700">Producto creado. Si quieres, agrégale modificadores abajo.</p>}
      <ProductForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        product={{
          id: product.id,
          name: product.name,
          categoryId: product.categoryId,
          price,
          sendsToKitchen: product.sendsToKitchen,
          active: product.active,
        }}
      />
      <h2 className="pt-4 text-xl font-semibold">Modificadores</h2>
      <ModifierEditor productId={product.id} modifiers={product.modifiers} />
    </>
  );
}
