import { Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { CatalogTabs, ProductList } from "@/modules/catalog";

export default function CatalogoPage() {
  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Catálogo</h1>
        <Button asChild>
          <Link href="/catalogo/productos/nuevo">
            <Plus /> Nuevo producto
          </Link>
        </Button>
      </div>
      <CatalogTabs active="/catalogo" />
      <ProductList />
    </>
  );
}
