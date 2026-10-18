import type { Cents } from "@/core/money";

/** Fila agregada por la base: un producto (cantidad y monto con los precios guardados en la orden). */
export type ProductRow = { productId: string; name: string; category: string | null; quantity: number; totalCents: Cents };

export type ProductSort = "cantidad" | "monto";

export type ProductsReport = {
  products: ProductRow[];
  totals: { quantity: number; totalCents: Cents };
  voided: { products: ProductRow[]; quantity: number; totalCents: Cents };
};

export function sortProducts(rows: ProductRow[], sort: ProductSort): ProductRow[] {
  return [...rows].sort((a, b) =>
    sort === "monto"
      ? b.totalCents - a.totalCents || b.quantity - a.quantity || a.name.localeCompare(b.name)
      : b.quantity - a.quantity || b.totalCents - a.totalCents || a.name.localeCompare(b.name),
  );
}

const totalsOf = (rows: ProductRow[]) => ({
  quantity: rows.reduce((s, r) => s + r.quantity, 0),
  totalCents: rows.reduce((s, r) => s + r.totalCents, 0),
});

export function buildProducts(sold: ProductRow[], voided: ProductRow[], sort: ProductSort): ProductsReport {
  return {
    products: sortProducts(sold, sort),
    totals: totalsOf(sold),
    voided: { products: sortProducts(voided, sort), ...totalsOf(voided) },
  };
}
