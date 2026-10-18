import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { appConfig } from "@/core/config/app";
import { formatMoney } from "@/core/money";

import type { DateRange } from "../domain/range";
import { getVoids } from "../services/reports";
import { Stat } from "./stat";

const dateTime = new Intl.DateTimeFormat("es-BO", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: appConfig.timezone,
});

/** Reporte de anulaciones: resumen, agrupado por motivo y la lista completa. */
export async function VoidsView({ range }: { range: DateRange }) {
  const r = await getVoids(range);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Anulaciones" value={String(r.totals.count)} />
        <Stat label="Monto anulado" value={formatMoney(r.totals.amountCents)} tone="danger" />
        <Stat label="Órdenes / ítems" value={`${r.totals.orders} / ${r.totals.items}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Por motivo</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-md text-left">
            <thead className="text-sm text-muted-foreground">
              <tr className="border-b">
                <th className="py-2">Motivo</th>
                <th className="py-2 text-right">Veces</th>
                <th className="py-2 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {r.byReason.map((g) => (
                <tr key={g.reason}>
                  <td className="py-2 font-medium">{g.reason}</td>
                  <td className="py-2 text-right">{g.count}</td>
                  <td className="py-2 text-right">{formatMoney(g.amountCents)}</td>
                </tr>
              ))}
              {r.byReason.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-muted-foreground">
                    No hubo anulaciones en este período 👌
                  </td>
                </tr>
              )}
            </tbody>
            {r.byReason.length > 0 && (
              <tfoot className="border-t-2 font-bold tabular-nums">
                <tr>
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right">{r.totals.count}</td>
                  <td className="py-2 text-right">{formatMoney(r.totals.amountCents)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>

      {r.entries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detalle</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-3xl text-left text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3">Fecha y hora</th>
                  <th className="py-2 pr-3">Orden</th>
                  <th className="py-2 pr-3">Qué</th>
                  <th className="py-2 pr-3 text-right">Monto</th>
                  <th className="py-2 pr-3">Motivo</th>
                  <th className="py-2 pr-3">Anuló</th>
                  <th className="py-2">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {r.entries.map((e, i) => (
                  <tr key={`${e.kind}-${e.orderId}-${i}`} className="align-top">
                    <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{dateTime.format(e.at)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <Link href={`/historial/${e.orderId}`} className="font-semibold underline-offset-2 hover:underline">
                        #{e.orderNumber}
                      </Link>
                      <div className="text-xs text-muted-foreground">{e.kind === "order" ? "Orden completa" : "Ítem"}</div>
                    </td>
                    <td className="py-2 pr-3">{e.products || "—"}</td>
                    <td className="py-2 pr-3 text-right font-medium whitespace-nowrap tabular-nums">{formatMoney(e.amountCents)}</td>
                    <td className="py-2 pr-3">{e.reason}</td>
                    <td className="py-2 pr-3">
                      {e.voidedBy}
                      {e.authorizedBy && <div className="text-xs text-muted-foreground">autorizó {e.authorizedBy}</div>}
                    </td>
                    <td className="space-x-1 space-y-1 py-2">
                      {e.inKitchen && <Badge variant="secondary">En cocina</Badge>}
                      {e.wasPaid && <Badge className="bg-red-600 text-white">Cobrada · devuelta</Badge>}
                      {!e.inKitchen && !e.wasPaid && <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
