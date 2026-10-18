import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { appConfig } from "@/core/config/app";
import { formatDay } from "@/core/export";
import { formatMoney } from "@/core/money";
import { cn } from "@/lib/utils";

import type { CreditStatusFilter } from "../domain/receivables";
import type { DateRange } from "../domain/range";
import { channelName } from "../domain/labels";
import { getReceivables } from "../services/reports";
import { Stat } from "./stat";

const date = new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: appConfig.timezone });

/** Reporte de cuentas por cobrar: resumen, por cliente y cada cuenta con su saldo. */
export async function ReceivablesView({
  range,
  status,
  customer,
}: {
  range: DateRange;
  status: CreditStatusFilter;
  customer: string | null;
}) {
  const r = await getReceivables(range, { status, customer });
  const base = { vista: "fiados", desde: range.from, hasta: range.to };
  const href = (extra: Record<string, string | null>) => {
    const next: Record<string, string> = { ...base };
    if (status !== "todas") next.estado = status;
    if (customer) next.cliente = customer;
    for (const [k, v] of Object.entries(extra)) {
      if (v === null) delete next[k];
      else next[k] = v;
    }
    return `/reportes?${new URLSearchParams(next)}`;
  };
  const pill = (active: boolean) =>
    cn("rounded-full border px-3 py-1.5 text-sm font-medium", active ? "border-primary bg-primary text-primary-foreground" : "bg-card");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 text-sm font-medium text-muted-foreground">Estado</span>
        {(
          [
            ["todas", "Todas"],
            ["pendiente", "Pendientes"],
            ["pagada", "Pagadas"],
          ] as const
        ).map(([key, label]) => (
          <Link key={key} href={href({ estado: key === "todas" ? null : key })} className={pill(status === key)}>
            {label}
          </Link>
        ))}
      </div>
      <form action="/reportes" className="flex flex-wrap items-center gap-2">
        {Object.entries({ ...base, ...(status !== "todas" ? { estado: status } : {}) }).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label htmlFor="cliente" className="w-16 text-sm font-medium text-muted-foreground">
          Cliente
        </label>
        <select
          id="cliente"
          name="cliente"
          defaultValue={customer ?? ""}
          className="h-11 min-w-48 rounded-md border bg-background px-3 text-base"
        >
          <option value="">Todos</option>
          {r.customers.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          Ver
        </Button>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total fiado" value={formatMoney(r.totals.amountCents)} />
        <Stat label="Total cobrado" value={formatMoney(r.totals.collectedCents)} />
        <Stat label="Pendiente" value={formatMoney(r.totals.balanceCents)} tone={r.totals.balanceCents > 0 ? "danger" : undefined} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Por cliente</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-lg text-left">
            <thead className="text-sm text-muted-foreground">
              <tr className="border-b">
                <th className="py-2">Cliente</th>
                <th className="py-2 text-right">Cuentas</th>
                <th className="py-2 text-right">Fiado</th>
                <th className="py-2 text-right">Cobrado</th>
                <th className="py-2 text-right">Debe</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {r.byCustomer.map((c) => (
                <tr key={c.customer}>
                  <td className="py-2 font-medium">
                    <Link href={href({ cliente: c.customer })} className="underline-offset-2 hover:underline">
                      {c.customer}
                    </Link>
                  </td>
                  <td className="py-2 text-right">{c.accounts}</td>
                  <td className="py-2 text-right">{formatMoney(c.amountCents)}</td>
                  <td className="py-2 text-right">{formatMoney(c.collectedCents)}</td>
                  <td className={cn("py-2 text-right font-semibold", c.balanceCents > 0 && "text-red-700 dark:text-red-400")}>
                    {formatMoney(c.balanceCents)}
                  </td>
                </tr>
              ))}
              {r.byCustomer.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    No hay cuentas por cobrar con estos filtros.
                  </td>
                </tr>
              )}
            </tbody>
            {r.byCustomer.length > 0 && (
              <tfoot className="border-t-2 font-bold tabular-nums">
                <tr>
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right">{r.totals.accounts}</td>
                  <td className="py-2 text-right">{formatMoney(r.totals.amountCents)}</td>
                  <td className="py-2 text-right">{formatMoney(r.totals.collectedCents)}</td>
                  <td className="py-2 text-right">{formatMoney(r.totals.balanceCents)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </CardContent>
      </Card>

      {r.rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cuentas</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-3xl text-left text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Fecha</th>
                  <th className="py-2 pr-3">Orden</th>
                  <th className="py-2 pr-3 text-right">Monto</th>
                  <th className="py-2 pr-3 text-right">Abonado</th>
                  <th className="py-2 pr-3 text-right">Saldo</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2">Pago</th>
                </tr>
              </thead>
              <tbody className="divide-y tabular-nums">
                {r.rows.map((a) => (
                  <tr key={a.paymentId}>
                    <td className="py-2 pr-3 font-medium">{a.customer}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDay(a.orderDate)}</td>
                    <td className="py-2 pr-3">
                      <Link href={`/historial/${a.orderId}`} className="font-semibold underline-offset-2 hover:underline">
                        #{a.orderNumber}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-right">{formatMoney(a.amountCents)}</td>
                    <td className="py-2 pr-3 text-right">{formatMoney(a.collectedCents)}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{formatMoney(a.balanceCents)}</td>
                    <td className="py-2 pr-3">
                      {a.status === "pagada" ? (
                        <Badge className="bg-green-600 text-white">Pagada</Badge>
                      ) : (
                        <Badge className="bg-yellow-300 text-black">Pendiente</Badge>
                      )}
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      {a.methods.length === 0
                        ? "—"
                        : a.settledAt
                          ? `${date.format(a.settledAt)} · ${a.methods.map(channelName).join(" + ")}`
                          : `Abonó: ${a.methods.map(channelName).join(" + ")}`}
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
