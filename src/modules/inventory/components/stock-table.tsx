import Link from "next/link";

import { formatQuantity } from "@/core/quantity";
import { formatCost, formatUnitCost, ITEM_TYPE_LABEL, UNIT_SHORT } from "@/modules/catalog";
import { cn } from "@/lib/utils";

import { listStockItems } from "../services/stock";
import { LevelBadge } from "./level-badge";

/** Stock actual de los ítems que manejan stock, con valor y alertas. */
export async function StockTable({ onlyAlerts = false }: { onlyAlerts?: boolean }) {
  const all = (await listStockItems()).filter((i) => i.active);
  const items = onlyAlerts ? all.filter((i) => i.level !== "ok") : all;
  const total = items.reduce((s, i) => s + (i.valueCents && i.stock.isPositive() ? i.valueCents.toNumber() : 0), 0);
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {items.length} ítems · valor del inventario (con último costo) {formatCost(total)}
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-2xl text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="p-2">Ítem</th>
              <th className="p-2">Tipo</th>
              <th className="p-2 text-right">Stock</th>
              <th className="p-2 text-right">Mínimo</th>
              <th className="p-2 text-right">Costo unit.</th>
              <th className="p-2 text-right">Valor</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((i) => (
              <tr key={i.id} className={cn(i.level === "negative" && "bg-red-50 dark:bg-red-950/40", i.level === "low" && "bg-yellow-50 dark:bg-yellow-950/30")}>
                <td className="p-2 font-medium">
                  <Link href={`/inventario/${i.id}`} className="underline-offset-2 hover:underline">
                    {i.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{i.category.name}</div>
                </td>
                <td className="p-2">{ITEM_TYPE_LABEL[i.type]}</td>
                <td className="p-2 text-right font-semibold tabular-nums">
                  {formatQuantity(i.stock)} {UNIT_SHORT[i.baseUnit]}
                </td>
                <td className="p-2 text-right tabular-nums">{i.minStock ? formatQuantity(i.minStock) : "—"}</td>
                <td className="p-2 text-right tabular-nums">{i.lastCostCents ? formatUnitCost(i.lastCostCents) : "—"}</td>
                <td className="p-2 text-right tabular-nums">{i.valueCents ? formatCost(i.valueCents) : "—"}</td>
                <td className="p-2">
                  <LevelBadge level={i.level} />
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  {onlyAlerts ? "Ningún ítem bajo el mínimo ni en negativo 👌" : "Ningún ítem maneja stock todavía (márcalo en Catálogo)."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
