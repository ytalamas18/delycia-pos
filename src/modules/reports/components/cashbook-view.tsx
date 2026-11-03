import Link from "next/link";

import { ExportButtons } from "@/components/shell/export-buttons";
import { formatDay } from "@/core/export";
import { formatMoney } from "@/core/money";
import { MONEY_ACCOUNT_LABEL } from "@/core/money/accounts";
import type { MoneyAccount } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

import { LEDGER_ACCOUNTS } from "@/core/money/accounts";
import type { DateRange } from "../domain/range";
import { getCashbook } from "../services/cashbook";
import { RangeFilter } from "./range-filter";

const th = "p-2 font-medium";
const pill = (active: boolean) =>
  cn("rounded-full border px-3 py-1.5 text-sm font-medium", active ? "border-primary bg-primary text-primary-foreground" : "bg-card");
const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
const signed = (cents: number) => (cents < 0 ? `− ${formatMoney(-cents)}` : formatMoney(cents));

/** Libro de caja y bancos: saldos por cuenta y movimientos cronológicos con saldo acumulado. */
export async function CashbookView({ range, account }: { range: DateRange; account: MoneyAccount | null }) {
  const book = await getCashbook(range, account);
  const keep: Record<string, string> = account ? { cuenta: account } : {};
  const href = (cuenta: MoneyAccount | null) =>
    `/caja-bancos?${new URLSearchParams({ ...(cuenta ? { cuenta } : {}), desde: range.from, hasta: range.to })}`;
  const showAccount = !account;

  return (
    <div className="space-y-4">
      <RangeFilter range={range} keep={keep} basePath="/caja-bancos" />
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-16 text-sm font-medium text-muted-foreground">Cuenta</span>
        <Link href={href(null)} className={pill(!account)}>
          Todas
        </Link>
        {LEDGER_ACCOUNTS.map((a) => (
          <Link key={a} href={href(a)} className={pill(account === a)}>
            {MONEY_ACCOUNT_LABEL[a]}
          </Link>
        ))}
      </div>
      <ExportButtons report="libro-caja-bancos" params={{ ...keep, desde: range.from, hasta: range.to }} />
      <p className="text-sm text-muted-foreground">
        {range.from === range.to ? shortDate(range.from) : `Del ${shortDate(range.from)} al ${shortDate(range.to)}`} · ventas
        cobradas por día y medio (lo fiado entra cuando se cobra) · compras a crédito entran al pagarse · días según la hora de La Paz.
      </p>
      {book.missingOpenings.length > 0 && (
        <p className="rounded-lg border border-yellow-400 bg-yellow-50 p-3 text-sm text-yellow-950 dark:bg-yellow-950 dark:text-yellow-100">
          Falta el saldo inicial de: {book.missingOpenings.map((a) => MONEY_ACCOUNT_LABEL[a]).join(", ")}. Sin él, esa cuenta empieza en 0
          desde el primer movimiento.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-xl text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className={th}>Cuenta</th>
              <th className={`${th} text-right`}>Saldo anterior</th>
              <th className={`${th} text-right`}>Ingresos</th>
              <th className={`${th} text-right`}>Egresos</th>
              <th className={`${th} text-right`}>Saldo final</th>
            </tr>
          </thead>
          <tbody className="divide-y tabular-nums">
            {book.accounts.map((s) => (
              <tr key={s.account}>
                <td className="p-2 font-medium">{MONEY_ACCOUNT_LABEL[s.account]}</td>
                <td className="p-2 text-right">
                  {signed(s.beforeCents)}
                  {s.openingCents !== 0 && <span className="block text-xs text-muted-foreground">+ saldo inicial {signed(s.openingCents)}</span>}
                </td>
                <td className="p-2 text-right text-green-700 dark:text-green-400">{formatMoney(s.inCents)}</td>
                <td className="p-2 text-right text-red-700 dark:text-red-400">{formatMoney(s.outCents)}</td>
                <td className="p-2 text-right font-semibold">{signed(s.endCents)}</td>
              </tr>
            ))}
          </tbody>
          {book.accounts.length > 1 && (
            <tfoot className="border-t-2 font-bold tabular-nums">
              <tr>
                <td className="p-2">Total</td>
                <td className="p-2 text-right">{signed(book.total.beforeCents + book.total.openingCents)}</td>
                <td className="p-2 text-right">{formatMoney(book.total.inCents)}</td>
                <td className="p-2 text-right">{formatMoney(book.total.outCents)}</td>
                <td className="p-2 text-right">{signed(book.total.endCents)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <h2 className="text-lg font-semibold">Movimientos</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-4xl text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className={th}>Fecha</th>
              {showAccount && <th className={th}>Cuenta</th>}
              <th className={th}>Detalle</th>
              <th className={`${th} text-right`}>Ingreso</th>
              <th className={`${th} text-right`}>Egreso</th>
              <th className={`${th} text-right`}>Saldo cuenta</th>
              {showAccount && <th className={`${th} text-right`}>Saldo total</th>}
            </tr>
          </thead>
          <tbody className="divide-y tabular-nums">
            <tr className="bg-muted/30">
              <td className="p-2">{formatDay(range.from)}</td>
              {showAccount && <td className="p-2" />}
              <td className="p-2 font-medium">Saldo anterior</td>
              <td className="p-2" />
              <td className="p-2" />
              <td className="p-2 text-right">{showAccount ? "" : signed(book.total.beforeCents)}</td>
              {showAccount && <td className="p-2 text-right font-semibold">{signed(book.total.beforeCents)}</td>}
            </tr>
            {book.lines.map((l, i) => (
              <tr key={i} className={cn(l.kind === "OPENING" && "bg-muted/30", (l.kind === "CASH_DIFFERENCE" || l.kind === "DEPOSIT_DIFFERENCE") && "bg-yellow-50 dark:bg-yellow-950/40")}>
                <td className="p-2 whitespace-nowrap">{formatDay(l.date)}</td>
                {showAccount && <td className="p-2 whitespace-nowrap">{MONEY_ACCOUNT_LABEL[l.account]}</td>}
                <td className="p-2">
                  <span className="font-medium">{l.detail}</span>
                  {l.items && <span className="block text-xs text-muted-foreground">{l.items}</span>}
                  {l.reference && <span className="block text-xs text-muted-foreground">N° {l.reference}</span>}
                </td>
                <td className="p-2 text-right text-green-700 dark:text-green-400">{l.inCents ? formatMoney(l.inCents) : ""}</td>
                <td className="p-2 text-right text-red-700 dark:text-red-400">{l.outCents ? formatMoney(l.outCents) : ""}</td>
                <td className="p-2 text-right">{signed(l.balanceCents)}</td>
                {showAccount && <td className="p-2 text-right font-semibold">{signed(l.totalBalanceCents)}</td>}
              </tr>
            ))}
            {book.lines.length === 0 && (
              <tr>
                <td colSpan={showAccount ? 7 : 5} className="p-6 text-center text-muted-foreground">
                  No hay movimientos en este período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">
        Efectivo: cada día con cierre guardado cambia lo que dice el cierre (contado − fondo); si hubo faltante o sobrante aparece como
        &quot;Diferencia de arqueo&quot;. Por depositar: alivios que alguien se llevó y todavía no depositó (debe volver a 0 al depositar
        todo). Banco: compáralo con el extracto (ventas por QR, depósitos y pagos por transferencia).
      </p>
    </div>
  );
}
