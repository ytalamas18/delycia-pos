import { appConfig } from "@/core/config/app";
import { formatDay } from "@/core/export";
import { formatMoney } from "@/core/money";
import { MONEY_ACCOUNT_LABEL, MONEY_ACCOUNTS } from "@/core/money/accounts";
import { businessDate } from "@/core/time";
import { cn } from "@/lib/utils";

import { voidOpeningBalanceAction, voidTransferAction } from "../actions";
import { listOpeningBalances, listTransfers } from "../services/accounts";
import { OpeningBalanceForm } from "./opening-balance-form";
import { TransferForm } from "./transfer-form";
import { VoidWithReason } from "./void-with-reason";

const th = "p-2 font-medium";
const time = new Intl.DateTimeFormat("es-BO", { timeStyle: "short", timeZone: appConfig.timezone });

/** Libro de caja y bancos → registrar depósitos / traspasos y saldos iniciales (con `cashbook.manage`). */
export async function TreasuryRecords({ range, canManage }: { range: { from: string; to: string }; canManage: boolean }) {
  const today = businessDate();
  const [transfers, openings] = await Promise.all([listTransfers(range), listOpeningBalances()]);
  const missing = MONEY_ACCOUNTS.filter((a) => !openings.some((o) => o.account === a && !o.voidedAt));

  return (
    <div className="space-y-6">
      {canManage && (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">Depósito / traspaso entre cuentas</h2>
          <p className="text-sm text-muted-foreground">
            No es ingreso ni gasto: sale de una cuenta y llega a otra. Si PeYa o ATC depositan con la comisión ya descontada, escribe lo que
            sale y lo que llega: la diferencia queda como egreso &quot;Comisión&quot;.
          </p>
          <TransferForm today={today} />
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Traspasos del período</h2>
        {transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay traspasos en este período.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-3xl text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className={th}>Fecha</th>
                  <th className={th}>De → a</th>
                  <th className={`${th} text-right`}>Sale</th>
                  <th className={`${th} text-right`}>Llega</th>
                  <th className={`${th} text-right`}>Comisión</th>
                  <th className={th}>N° / nota</th>
                  <th className={th}>Registró</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y tabular-nums">
                {transfers.map((t) => (
                  <tr key={t.id} className={cn(t.voidedAt && "text-muted-foreground")}>
                    <td className="p-2 whitespace-nowrap">
                      {formatDay(t.date)}
                      <span className="block text-xs text-muted-foreground">{time.format(t.createdAt)}</span>
                    </td>
                    <td className="p-2">
                      {MONEY_ACCOUNT_LABEL[t.fromAccount]} → {MONEY_ACCOUNT_LABEL[t.toAccount]}
                    </td>
                    <td className={cn("p-2 text-right", t.voidedAt && "line-through")}>{formatMoney(t.amountOutCents)}</td>
                    <td className={cn("p-2 text-right", t.voidedAt && "line-through")}>{formatMoney(t.amountInCents)}</td>
                    <td className="p-2 text-right">{t.commissionCents ? formatMoney(t.commissionCents) : "—"}</td>
                    <td className="p-2">{[t.reference && `N° ${t.reference}`, t.note].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="p-2">{t.createdByName ?? "—"}</td>
                    <td className="p-2">
                      {t.voidedAt ? (
                        <span className="text-xs text-red-700 dark:text-red-400">
                          Anulado{t.voidedByName ? ` por ${t.voidedByName}` : ""}: {t.voidReason}
                        </span>
                      ) : (
                        canManage && (t.fromAccount !== "CASH" || t.date === today) && (
                          <VoidWithReason id={t.id} label="Anular" action={voidTransferAction} />
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Saldos iniciales</h2>
        {openings.length > 0 && (
          <ul className="divide-y rounded-lg border text-sm">
            {openings.map((o) => (
              <li key={o.id} className={cn("flex flex-wrap items-center gap-3 p-3", o.voidedAt && "text-muted-foreground")}>
                <span className="w-32 font-medium">{MONEY_ACCOUNT_LABEL[o.account]}</span>
                <span className="w-40">al empezar el {formatDay(o.date)}</span>
                <span className={cn("w-28 text-right font-semibold tabular-nums", o.voidedAt && "line-through")}>
                  {o.amountCents < 0 ? `− ${formatMoney(-o.amountCents)}` : formatMoney(o.amountCents)}
                </span>
                <span className="flex-1 text-muted-foreground">
                  {o.voidedAt ? `Anulado${o.voidedByName ? ` por ${o.voidedByName}` : ""}: ${o.voidReason}` : [o.note, o.createdByName && `cargó ${o.createdByName}`].filter(Boolean).join(" · ")}
                </span>
                {!o.voidedAt && canManage && <VoidWithReason id={o.id} label="Anular para corregir" action={voidOpeningBalanceAction} />}
              </li>
            ))}
          </ul>
        )}
        {canManage && missing.length > 0 && (
          <div className="space-y-2 rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">
              Se carga una vez por cuenta: con cuánto empieza el libro ese día (Efectivo: lo que hay en caja y guardado; Banco: según el
              extracto; ATC / PeYa: lo pendiente de depositar). Lo anterior a esa fecha no cuenta en la cuenta.
            </p>
            <OpeningBalanceForm accounts={missing} today={today} />
          </div>
        )}
      </section>
    </div>
  );
}
