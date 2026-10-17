"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { formatMoney } from "@/core/money";
import type { SalesChannel } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

import { unitPriceFor } from "../domain/pricing";
import type { PosCategory, PosProduct } from "./pos-types";

/** Sin tildes y en minúsculas, para que "milanesa" encuentre "Milanesa" y "pique" encuentre "Piqué". */
function normalize(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function ProductGrid({
  categories,
  products,
  channel,
  markupPercent,
  onAdd,
}: {
  categories: PosCategory[];
  products: PosProduct[];
  channel: SalesChannel;
  markupPercent: number;
  onAdd: (product: PosProduct) => void;
}) {
  const [categoryId, setCategoryId] = useState<string | null>(categories[0]?.id ?? null);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    // Al buscar se ignora la categoría: busca en todo el catálogo.
    if (q) return products.filter((p) => normalize(p.name).includes(q));
    return products.filter((p) => p.categoryId === categoryId);
  }, [products, categoryId, query]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar producto…"
          className="h-12 pl-10 text-lg"
          aria-label="Buscar producto"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={!query && c.id === categoryId}
            onClick={() => {
              setCategoryId(c.id);
              setQuery("");
            }}
            className={cn(
              "h-12 shrink-0 rounded-lg border px-5 text-base font-semibold whitespace-nowrap",
              !query && c.id === categoryId ? "border-primary bg-primary text-primary-foreground" : "bg-card",
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {visible.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onAdd(p)}
            className="flex min-h-24 flex-col justify-between rounded-xl border bg-card p-3 text-left shadow-xs transition active:scale-[0.97] active:bg-accent"
          >
            <span className="text-base leading-tight font-semibold">{p.name}</span>
            <span className="pt-2 text-lg font-bold text-primary tabular-nums">
              {formatMoney(unitPriceFor({ listPriceCents: p.priceCents, channel, markupPercent }))}
            </span>
          </button>
        ))}
        {visible.length === 0 && (
          <p className="col-span-full py-8 text-center text-muted-foreground">
            {query ? "No hay productos con ese nombre." : "Esta categoría no tiene productos activos."}
          </p>
        )}
      </div>
    </div>
  );
}
