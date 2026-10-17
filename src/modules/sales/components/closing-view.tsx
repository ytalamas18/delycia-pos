import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { appConfig } from "@/core/config/app";
import { formatMoney } from "@/core/money";
import type { PaymentMethod } from "@/generated/prisma/enums";

import { paymentMethodLabel } from "../domain/labels";
import { getDailyClosing } from "../services/history";
import { ClosingForm } from "./closing-form";
import { DayPicker } from "./day-picker";

const METHODS: PaymentMethod[] = ["CASH", "QR", "CARD", "PEYA", "CREDIT"];
const time = new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short", timeZone: appConfig.timezone });

export async function ClosingView({ date }: { date: string }) {
  const { summary: s, saved, closedByName } = await getDailyClosing(date);

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DayPicker basePath="/cierre" date={date} />
        <Button asChild variant="outline">
          <a href={`/imprimir/cierre/${date}`} target="_blank" rel="noreferrer">
            <Printer /> Imprimir
          </a>
        </Button>
      </div>

      {s.openCount > 0 && (
        <div className="rounded-lg border-2 border-yellow-400 bg-yellow-50 p-3 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200" role="alert">
          ⚠ Hay {s.openCount} orden(es) <strong>por pagar</strong> por {formatMoney(s.openTotalCents)}. No cuentan en el cierre
          hasta que se cobren.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Ventas netas" value={formatMoney(s.netCents)} strong />
        <Stat label="Órdenes cobradas" value={String(s.paidCount)} />
        <Stat label="Ticket promedio" value={formatMoney(s.averageTicketCents)} />
        <Stat label="Descuentos" value={formatMoney(s.discountCents)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dinero del día por medio</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full">
              <thead className="text-left text-sm text-muted-foreground">
                <tr>
                  <th className="py-1">Medio</th>
                  <th className="text-right">Ventas</th>
                  <th className="text-right">Cobro fiados</th>
                  <th className="text-right">Entró</th>
                </tr>
              </thead>
              <tbody>
                {METHODS.map((m) => (
                  <tr key={m} className="border-t">
                    <td className="py-1.5 font-medium">{paymentMethodLabel[m]}</td>
                    <td className="text-right tabular-nums">{formatMoney(s.salesByMethod[m])}</td>
                    <td className="text-right tabular-nums">{m === "CREDIT" ? "—" : formatMoney(s.collectionsByMethod[m])}</td>
                    <td className="text-right font-semibold tabular-nums">{m === "CREDIT" ? "—" : formatMoney(s.moneyInByMethod[m])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pt-2 text-sm text-muted-foreground">
              &quot;Cuenta por cobrar&quot; es lo que quedó fiado hoy: es venta, pero no dinero que entró.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por canal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Row label={`Local (${s.byChannel.LOCAL.count})`} value={formatMoney(s.byChannel.LOCAL.netCents)} />
            <Row label={`PEYA (${s.byChannel.PEYA.count})`} value={formatMoney(s.byChannel.PEYA.netCents)} />
            <div className="border-t pt-2">
              <Row label="Ventas brutas" value={formatMoney(s.grossCents)} />
              <Row label="Descuentos" value={`− ${formatMoney(s.discountCents)}`} />
              <Row label="Ventas netas" value={formatMoney(s.netCents)} strong />
            </div>
            {s.cancelledCount > 0 && <p className="text-sm text-muted-foreground">Anuladas: {s.cancelledCount}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Arqueo de caja</CardTitle>
          {saved && (
            <p className="text-sm text-muted-foreground">
              Cierre guardado por {closedByName} el {time.format(saved.closedAt)}. Puedes corregirlo y volver a guardar.
            </p>
          )}
        </CardHeader>
        <CardContent>
          <ClosingForm
            date={date}
            cashInCents={s.moneyInByMethod.CASH}
            saved={saved ? { openingCashCents: saved.openingCashCents, countedCashCents: saved.countedCashCents, notes: saved.notes } : null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Productos vendidos</CardTitle>
        </CardHeader>
        <CardContent>
          {s.products.length === 0 ? (
            <p className="text-muted-foreground">Sin ventas cobradas este día.</p>
          ) : (
            <table className="w-full">
              <thead className="text-left text-sm text-muted-foreground">
                <tr>
                  <th className="py-1">Producto</th>
                  <th className="text-right">Cant.</th>
                  <th className="text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {s.products.map((p) => (
                  <tr key={p.name} className="border-t">
                    <td className="py-1.5">{p.name}</td>
                    <td className="text-right tabular-nums">{p.quantity}</td>
                    <td className="text-right tabular-nums">{formatMoney(p.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={strong ? "text-3xl font-bold tabular-nums" : "text-2xl font-semibold tabular-nums"}>{value}</div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-lg font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
