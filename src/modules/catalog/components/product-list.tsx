import { Pencil } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/core/money";
import { formatQuantity } from "@/core/quantity";
import { cn } from "@/lib/utils";

import { moveProductAction, setProductActiveAction } from "../actions";
import { formatUnitCost } from "../domain/costs";
import { ITEM_TYPE_LABEL, ITEM_TYPE_PLURAL, ITEM_TYPES, isSellable, type ItemType } from "../domain/item-types";
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

/** Cómo se agrupa la lista: por categoría (orden del POS) o por tipo de ítem. */
export type ProductListGroup = "categoria" | "tipo";

type Item = Awaited<ReturnType<typeof listProducts>>[number];

export async function ProductList({
  filter = "todos",
  groupBy = "categoria",
}: {
  filter?: ProductListFilter;
  groupBy?: ProductListGroup;
}) {
  const [categories, allProducts] = await Promise.all([listCategories(), listProducts()]);
  const products = allProducts.filter((p) => matches(p.type, filter));

  if (categories.length === 0) {
    return <p className="text-muted-foreground">Primero crea una categoría en la pestaña &quot;Categorías&quot;.</p>;
  }

  if (groupBy === "tipo") {
    return (
      <div className="space-y-8">
        {ITEM_TYPES.map((type) => {
          const items = products.filter((p) => p.type === type);
          if (items.length === 0) return null;
          return (
            <section key={type} className="space-y-2">
              <h2 className="text-xl font-semibold">{ITEM_TYPE_PLURAL[type]}</h2>
              <ul className="divide-y rounded-lg border">
                {items.map((p) => (
                  <ProductRow key={p.id} p={p} byType />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    );
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
                <ProductRow key={p.id} p={p} isFirst={index === 0} isLast={index === items.length - 1} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ProductRow({
  p,
  isFirst = true,
  isLast = true,
  byType = false,
}: {
  p: Item;
  isFirst?: boolean;
  isLast?: boolean;
  /** Vista por tipo: muestra la categoría y no permite subir/bajar. */
  byType?: boolean;
}) {
  return (
    <li className={cn("flex flex-wrap items-center gap-3 p-3", !p.active && "opacity-60")}>
      <div className="min-w-48 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-lg font-medium">
          {p.name}
          {!p.active && <Badge variant="secondary">Inactivo</Badge>}
        </div>
        <div className="flex flex-wrap gap-2 pt-1 text-sm text-muted-foreground">
          {byType ? (
            <Badge variant="outline">{p.category.name}</Badge>
          ) : (
            <Badge variant={p.type === "NORMAL" ? "outline" : "secondary"}>{ITEM_TYPE_LABEL[p.type]}</Badge>
          )}
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
        isFirst={isFirst}
        isLast={isLast}
        canMove={!byType}
        onMove={moveProductAction.bind(null, p.id)}
        onToggle={setProductActiveAction.bind(null, p.id)}
      />
      <Button asChild variant="outline" size="icon" aria-label={`Editar ${p.name}`}>
        <Link href={`/catalogo/productos/${p.id}`}>
          <Pencil />
        </Link>
      </Button>
    </li>
  );
}
