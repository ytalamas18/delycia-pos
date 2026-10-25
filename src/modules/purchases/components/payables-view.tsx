import Link from "next/link";

import { formatDay } from "@/core/export";
import { formatMoney } from "@/core/money";
import { cn } from "@/lib/utils";

import { listPayables } from "../services/purchases";
import { PurchaseStatusBadge } from "./status-badge";

/** Cuentas por pagar: total por proveedor y cada compra con saldo (vencidas resaltadas). */
export async function PayablesView() {
  const rows = await listPayables();
  const bySupplier = new Map<string, { name: string; balance: number; count: number; overdue: number }>();
  for (const p of rows) {
    const key = p.supplier?.id ?? "-";
    const g = bySupplier.get(key) ?? { name: p.supplier?.name ?? "Sin proveedor", balance: 0, count: 0, overdue: 0 };
    g.balance += p.balanceCents;
    g.count += 1;
    if (p.overdue) g.overdue += p.balanceCents;
    bySupplier.set(key, g);
  }
  const total = rows.reduce((s, p) => s + p.balanceCents, 0);
  return (
    <div className="space-y-6">
      <p className="text-lg">
        Total por pagar: <strong>{formatMoney(total)}</strong>
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-md text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="p-2">Proveedor</th>
              <th className="p-2 text-right">Compras</th>
              <th className="p-2 text-right">Vencido</th>
              <th className="p-2 text-right">Debe</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {[...bySupplier.values()]
              .sort((a, b) => b.balance - a.balance)
              .map((g) => (
                <tr key={g.name}>
                  <td className="p-2 font-medium">{g.name}</td>
                  <td className="p-2 text-right">{g.count}</td>
                  <td className={cn("p-2 text-right tabular-nums", g.overdue > 0 && "font-semibold text-red-700 dark:text-red-400")}>
                    {formatMoney(g.overdue)}
                  </td>
                  <td className="p-2 text-right font-semibold tabular-nums">{formatMoney(g.balance)}</td>
                </tr>
              ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-muted-foreground">
                  No hay compras pendientes de pago 👌
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-2xl text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="p-2">Compra</th>
                <th className="p-2">Fecha</th>
                <th className="p-2">Proveedor</th>
                <th className="p-2">Vence</th>
                <th className="p-2 text-right">Total</th>
                <th className="p-2 text-right">Abonado</th>
                <th className="p-2 text-right">Saldo</th>
                <th className="p-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((p) => (
                <tr key={p.id} className={cn(p.overdue && "bg-red-50 dark:bg-red-950/40")}>
                  <td className="p-2 font-semibold">
                    <Link href={`/compras/${p.id}`} className="underline-offset-2 hover:underline">
                      #{p.number}
                    </Link>
                  </td>
                  <td className="p-2 whitespace-nowrap">{formatDay(p.date)}</td>
                  <td className="p-2">{p.supplier?.name ?? "—"}</td>
                  <td className="p-2 whitespace-nowrap">{p.dueDate ? formatDay(p.dueDate) : "—"}</td>
                  <td className="p-2 text-right tabular-nums">{formatMoney(p.totalCents)}</td>
                  <td className="p-2 text-right tabular-nums">{formatMoney(p.paidCents)}</td>
                  <td className="p-2 text-right font-semibold tabular-nums">{formatMoney(p.balanceCents)}</td>
                  <td className="p-2">
                    <PurchaseStatusBadge status={p.paymentStatus} overdue={p.overdue} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
