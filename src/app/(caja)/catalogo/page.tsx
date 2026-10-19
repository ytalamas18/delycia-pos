import { Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CatalogTabs,
  PRODUCT_LIST_FILTERS,
  ProductList,
  type ProductListFilter,
  type ProductListGroup,
} from "@/modules/catalog";

const chip = (active: boolean) =>
  cn(
    "rounded-full border px-4 py-1.5 text-sm font-medium",
    active ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground",
  );

function href(filter: ProductListFilter, groupBy: ProductListGroup) {
  const params = new URLSearchParams();
  if (filter !== "todos") params.set("tipo", filter);
  if (groupBy !== "tipo") params.set("agrupar", groupBy);
  const query = params.toString();
  return query ? `/catalogo?${query}` : "/catalogo";
}

export default async function CatalogoPage({ searchParams }: PageProps<"/catalogo">) {
  const { tipo, agrupar } = await searchParams;
  const filter: ProductListFilter = PRODUCT_LIST_FILTERS.find((f) => f.value === tipo)?.value ?? "todos";
  // Por defecto se agrupa por tipo; "por categoría" muestra el orden del POS (y permite subir/bajar).
  const groupBy: ProductListGroup = agrupar === "categoria" ? "categoria" : "tipo";
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="Filtrar por tipo">
          {PRODUCT_LIST_FILTERS.map((f) => (
            <Link key={f.value} href={href(f.value, groupBy)} className={chip(f.value === filter)}>
              {f.label}
            </Link>
          ))}
        </nav>
        <nav className="flex items-center gap-2 text-sm" aria-label="Agrupar">
          <span className="text-muted-foreground">Agrupar por</span>
          <Link href={href(filter, "tipo")} className={chip(groupBy === "tipo")}>
            Tipo
          </Link>
          <Link href={href(filter, "categoria")} className={chip(groupBy === "categoria")}>
            Categoría
          </Link>
        </nav>
      </div>
      <ProductList filter={filter} groupBy={groupBy} />
    </>
  );
}
