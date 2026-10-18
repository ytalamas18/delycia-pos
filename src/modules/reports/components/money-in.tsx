import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/core/money";

import type { DateRange } from "../domain/range";
import { channelName } from "../domain/labels";
import { getMoneyIn } from "../services/reports";

/** Venta ≠ dinero: lo fiado se vende hoy pero entra cuando se abona. Esto es lo que se compara con la caja. */
export async function MoneyIn({ range }: { range: DateRange }) {
  const m = await getMoneyIn(range);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dinero cobrado (lo que entró)</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-md text-left">
          <thead className="text-sm text-muted-foreground">
            <tr className="border-b">
              <th className="py-2">Medio</th>
              <th className="py-2 text-right">Ventas cobradas</th>
              <th className="py-2 text-right">Abonos de fiados</th>
              <th className="py-2 text-right">Total entró</th>
            </tr>
          </thead>
          <tbody className="divide-y tabular-nums">
            {m.rows.map((r) => (
              <tr key={r.channel}>
                <td className="py-2 font-medium">{channelName(r.channel)}</td>
                <td className="py-2 text-right">{formatMoney(r.salesCents)}</td>
                <td className="py-2 text-right">{formatMoney(r.collectionsCents)}</td>
                <td className="py-2 text-right font-semibold">{formatMoney(r.totalCents)}</td>
              </tr>
            ))}
            {m.rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted-foreground">
                  No entró dinero en este período.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t-2 font-bold tabular-nums">
            <tr>
              <td className="py-2">Total</td>
              <td className="py-2 text-right">{formatMoney(m.totals.salesCents)}</td>
              <td className="py-2 text-right">{formatMoney(m.totals.collectionsCents)}</td>
              <td className="py-2 text-right">{formatMoney(m.totals.totalCents)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-2 text-sm text-muted-foreground">
          Fiado en el período (vendido, todavía no es dinero): <strong>{formatMoney(m.creditSalesCents)}</strong>. Los abonos
          cuentan el día en que se cobran, sea de una orden de este período o de antes.
        </p>
      </CardContent>
    </Card>
  );
}
