import { Pencil } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/core/money";
import { formatQuantity } from "@/core/quantity";
import { cn } from "@/lib/utils";

import { moveProductAction, setProductActiveAction } from "../actions";
import { formatUnitCost } from "../domain/costs";
import { ITEM_TYPE_LABEL, isSellable, type ItemType } from "../domain/item-types";
import { UNIT_LABEL } from "../domain/units";
import { listCategories } from "../services/categories";
import { listProducts } from "../services/products";
import { RowControls } from "./row-controls";

/** Filtro de la lista: "venta" = Normal + Preparado; o un tipo puntual. */
export type ProductListFilter = "todos" | "venta" | ItemType;

export const PRODUCT_LIST_FILTERS: { value: ProductListFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "venta", label: "De venta" },
  { value: "PREPARED", label: "Preparados" },
  { value: "INGREDIENT", label: "Ingredientes" },
  { value: "SUPPLY", label: "Insumos" },
];

function matches(type: ItemType, filter: ProductListFilter) {
  if (filter === "todos") return true;
  if (filter === "venta") return isSellable(type);
  return type === filter;
}

export async function ProductList({ filter = "todos" }: { filter?: ProductListFilter }) {
  const [categories, allProducts] = await Promise.all([listCategories(), listProducts()]);
  const products = allProducts.filter((p) => matches(p.type, filter));

  if (categories.length === 0) {
    return <p className="text-muted-foreground">Primero crea una categoría en la pestaña &quot;Categorías&quot;.</p>;
  }

  return (
    <div className="space-y-8">
      {categories.map((category) => {
        const items = products.filter((p) => p.categoryId === category.id);
        if (items.length === 0 && filter !== "todos") return null;
        return (
          <section key={category.id} className="space-y-2">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              {category.name}
              {!category.active && <Badge variant="secondary">Categoría inactiva</Badge>}
            </h2>
            {items.length === 0 && <p className="text-sm text-muted-foreground">Sin productos.</p>}
            <ul className="divide-y rounded-lg border">
              {items.map((p, index) => (
                <li key={p.id} className={cn("flex flex-wrap items-center gap-3 p-3", !p.active && "opacity-60")}>
                  <div className="min-w-48 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-lg font-medium">
                      {p.name}
                      {!p.active && <Badge variant="secondary">Inactivo</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1 text-sm text-muted-foreground">
                      <Badge variant={p.type === "NORMAL" ? "outline" : "secondary"}>{ITEM_TYPE_LABEL[p.type]}</Badge>
                      {isSellable(p.type) && (
                        <Badge variant={p.sendsToKitchen ? "default" : "outline"}>
                          {p.sendsToKitchen ? "Va a cocina" : "No va a cocina"}
                        </Badge>
                      )}
                      {p.tracksStock && (
                        <Badge variant="outline">
                          Stock en {UNIT_LABEL[p.baseUnit]}
                          {p.minStock ? ` · mín. ${formatQuantity(p.minStock)}` : ""}
                        </Badge>
                      )}
                      {p.lastCostCents && (
                        <span>
                          Costo {formatUnitCost(p.lastCostCents)}/{UNIT_LABEL[p.baseUnit]}
                        </span>
                      )}
                      {p.modifiers.length > 0 && <span>{p.modifiers.map((m) => m.name).join(" · ")}</span>}
                    </div>
                  </div>
                  <span className="w-28 text-right text-lg font-semibold tabular-nums">
                    {isSellable(p.type) ? formatMoney(p.priceCents) : <span className="text-muted-foreground">—</span>}
                  </span>
                  <RowControls
                    active={p.active}
                    isFirst={index === 0}
                    isLast={index === items.length - 1}
                    onMove={moveProductAction.bind(null, p.id)}
                    onToggle={setProductActiveAction.bind(null, p.id)}
                  />
                  <Button asChild variant="outline" size="icon" aria-label={`Editar ${p.name}`}>
                    <Link href={`/catalogo/productos/${p.id}`}>
                      <Pencil />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
