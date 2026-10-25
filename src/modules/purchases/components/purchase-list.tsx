import Link from "next/link";

import { formatDay } from "@/core/export";
import { formatMoney } from "@/core/money";
import { cn } from "@/lib/utils";

import { listPurchases } from "../services/purchases";
import { PurchaseStatusBadge } from "./status-badge";

export async function PurchaseList({ from, to }: { from: string; to: string }) {
  const rows = await listPurchases({ from, to });
  const active = rows.filter((r) => r.status === "ACTIVE");
  const total = active.reduce((s, r) => s + r.totalCents, 0);
  const balance = active.reduce((s, r) => s + r.balanceCents, 0);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {active.length} compras · total {formatMoney(total)} · por pagar {formatMoney(balance)}
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-2xl text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="p-2">N°</th>
              <th className="p-2">Fecha</th>
              <th className="p-2">Proveedor</th>
              <th className="p-2">Ítems</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2 text-right">Saldo</th>
              <th className="p-2">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((p) => (
              <tr key={p.id} className={cn(p.status === "CANCELLED" && "opacity-60")}>
                <td className="p-2 font-semibold">
                  <Link href={`/compras/${p.id}`} className="underline-offset-2 hover:underline">
                    #{p.number}
                  </Link>
                </td>
                <td className="p-2 whitespace-nowrap">{formatDay(p.date)}</td>
                <td className="p-2">{p.supplier?.name ?? "—"}</td>
                <td className="p-2 text-muted-foreground">{p.lines.map((l) => l.productName).join(", ")}</td>
                <td className={cn("p-2 text-right tabular-nums", p.status === "CANCELLED" && "line-through")}>{formatMoney(p.totalCents)}</td>
                <td className="p-2 text-right tabular-nums">{p.status === "ACTIVE" ? formatMoney(p.balanceCents) : "—"}</td>
                <td className="p-2">
                  <PurchaseStatusBadge status={p.paymentStatus} cancelled={p.status === "CANCELLED"} overdue={p.overdue} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No hay compras en este período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
