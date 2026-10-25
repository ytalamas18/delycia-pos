import { notFound } from "next/navigation";

import { appConfig } from "@/core/config/app";
import { formatQuantity } from "@/core/quantity";
import { listTrackedItems, UNIT_SHORT } from "@/modules/catalog";
import { cn } from "@/lib/utils";

import { MOVEMENT_LABEL } from "../domain/labels";
import { stockLevel, withRunningBalance } from "../domain/stock";
import { itemMovements } from "../services/stock";
import { LevelBadge } from "./level-badge";

const dateTime = new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short", timeZone: appConfig.timezone });

/** Kárdex de un ítem: todos sus movimientos con saldo acumulado. */
export async function Kardex({ productId }: { productId: string }) {
  const [item] = await listTrackedItems({ ids: [productId] });
  if (!item) notFound();
  const { movements, opening } = await itemMovements(productId);
  const rows = withRunningBalance(movements, opening);
  const current = rows.at(-1)?.balance ?? opening;
  const unit = UNIT_SHORT[item.baseUnit];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{item.name}</h1>
        <span className="text-lg">
          Stock: <strong>{formatQuantity(current)} {unit}</strong>
        </span>
        <LevelBadge level={stockLevel(current, item.minStock)} />
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-xl text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="p-2">Fecha</th>
              <th className="p-2">Movimiento</th>
              <th className="p-2">Nota</th>
              <th className="p-2 text-right">Cantidad</th>
              <th className="p-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="p-2 whitespace-nowrap">{dateTime.format(m.at)}</td>
                <td className="p-2">{MOVEMENT_LABEL[m.type]}</td>
                <td className="p-2 text-muted-foreground">{m.note ?? ""}</td>
                <td className={cn("p-2 text-right tabular-nums", m.quantity.isNegative() ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400")}>
                  {m.quantity.isPositive() ? "+" : ""}
                  {formatQuantity(m.quantity)}
                </td>
                <td className={cn("p-2 text-right font-semibold tabular-nums", m.balance.isNegative() && "text-red-700 dark:text-red-400")}>
                  {formatQuantity(m.balance)} {unit}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted-foreground">
                  Sin movimientos todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
