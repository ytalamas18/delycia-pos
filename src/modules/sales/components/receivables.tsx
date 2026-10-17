import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { appConfig } from "@/core/config/app";
import { formatMoney } from "@/core/money";

import { paymentMethodLabel } from "../domain/labels";
import { listOpenReceivables, listSettledReceivables, type Receivable } from "../services/checkout";
import { CollectForm } from "./collect-form";

const date = new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "2-digit", timeZone: appConfig.timezone });

function daysSince(d: Date) {
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

/** Agrupa por cliente sin distinguir mayúsculas ni espacios ("don pedro" = "Don Pedro "). */
function groupByDebtor(rows: Receivable[]) {
  const groups = new Map<string, { name: string; rows: Receivable[]; balance: number; oldest: Date }>();
  for (const r of rows) {
    const key = r.debtorName.trim().toLowerCase();
    const g = groups.get(key) ?? { name: r.debtorName.trim(), rows: [], balance: 0, oldest: r.createdAt };
    g.rows.push(r);
    g.balance += r.balanceCents;
    if (r.createdAt < g.oldest) g.oldest = r.createdAt;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.balance - a.balance);
}

/** Reporte de cuentas por cobrar: quién debe, cuánto y desde cuándo; y registrar pagos. */
export async function Receivables() {
  const [open, settled] = await Promise.all([listOpenReceivables(), listSettledReceivables(30)]);
  const groups = groupByDebtor(open);
  const totalOwed = open.reduce((s, r) => s + r.balanceCents, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total por cobrar" value={formatMoney(totalOwed)} strong />
        <Stat label="Clientes que deben" value={String(groups.length)} />
        <Stat
          label="Deuda más antigua"
          value={open.length ? `${daysSince(open[0].createdAt)} días` : "—"}
        />
      </div>

      {groups.length === 0 && <p className="py-8 text-center text-muted-foreground">Nadie debe nada. 🎉</p>}

      {groups.map((g) => (
        <Card key={g.name}>
          <CardHeader className="flex-row items-center justify-between gap-2">
            <CardTitle className="text-xl">{g.name}</CardTitle>
            <div className="text-right">
              <div className="text-2xl font-bold text-destructive tabular-nums">{formatMoney(g.balance)}</div>
              <div className="text-sm text-muted-foreground">debe desde hace {daysSince(g.oldest)} días</div>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {g.rows.map((r) => (
                <li key={r.paymentId} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-48 flex-1">
                    <div className="font-medium">
                      Orden #{r.orderNumber} · {date.format(r.createdAt)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Fiado {formatMoney(r.amountCents)}
                      {r.collectedCents > 0 && ` · abonado ${formatMoney(r.collectedCents)}`}
                    </div>
                  </div>
                  <div className="w-28 text-right text-lg font-bold tabular-nums">{formatMoney(r.balanceCents)}</div>
                  <CollectForm paymentId={r.paymentId} balanceCents={r.balanceCents} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}

      {settled.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Saldadas en los últimos 30 días</h2>
          <ul className="divide-y rounded-lg border">
            {settled.map((r) => (
              <li key={r.paymentId} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className="flex-1 font-medium">
                  {r.debtorName} · Orden #{r.orderNumber}
                </span>
                <span className="text-muted-foreground">
                  {r.collections.map((c) => `${paymentMethodLabel[c.method]} ${formatMoney(c.amountCents)}`).join(" + ")}
                </span>
                <Badge variant="secondary">Saldada {r.settledAt ? date.format(r.settledAt) : ""}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={strong ? "text-3xl font-bold text-destructive tabular-nums" : "text-2xl font-semibold"}>{value}</div>
    </div>
  );
}
