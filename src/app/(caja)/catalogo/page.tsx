import { Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CatalogTabs, PRODUCT_LIST_FILTERS, ProductList, type ProductListFilter } from "@/modules/catalog";

export default async function CatalogoPage({ searchParams }: PageProps<"/catalogo">) {
  const { tipo } = await searchParams;
  const filter = PRODUCT_LIST_FILTERS.find((f) => f.value === tipo)?.value ?? "todos";
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Catálogo</h1>
        <Button asChild>
          <Link href="/catalogo/productos/nuevo">
            <Plus /> Nuevo ítem
          </Link>
        </Button>
      </div>
      <CatalogTabs active="/catalogo" />
      <nav className="flex flex-wrap gap-2" aria-label="Filtrar por tipo">
        {PRODUCT_LIST_FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "todos" ? "/catalogo" : `/catalogo?tipo=${f.value}`}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium",
              f.value === filter ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <ProductList filter={filter as ProductListFilter} />
    </>
  );
}
