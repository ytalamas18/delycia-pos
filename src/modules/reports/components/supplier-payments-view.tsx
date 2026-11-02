import Link from "next/link";

import { appConfig } from "@/core/config/app";
import { formatDay } from "@/core/export";
import { formatMoney } from "@/core/money";
import { MONEY_ACCOUNT_LABEL, MONEY_ACCOUNTS } from "@/core/money/accounts";
import type { MoneyAccount, SupplierPaymentMethod } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { SUPPLIER_METHOD_LABEL } from "@/modules/purchases";

import type { DateRange } from "../domain/range";
import { itemsText } from "../domain/supplier-payments";
import { getSupplierPaymentsReport } from "../services/stock-purchases";
import { Stat } from "./stat";

const METHODS: SupplierPaymentMethod[] = ["CASH", "TRANSFER", "CARD"];
const th = "p-2 font-medium";
const pill = (active: boolean) =>
  cn("rounded-full border px-3 py-1.5 text-sm font-medium", active ? "border-primary bg-primary text-primary-foreground" : "bg-card");
const time = new Intl.DateTimeFormat("es-BO", { timeStyle: "short", timeZone: appConfig.timezone });

/** Reportes → Compras → Pagos a proveedores: todos los pagos por fecha del pago, para cuadrar con caja y banco. */
export async function SupplierPaymentsReportView({
  range,
  method,
  account,
}: {
  range: DateRange;
  method: SupplierPaymentMethod | null;
  account: MoneyAccount | null;
}) {
  const r = await getSupplierPaymentsReport(range, { method, account });
  const href = (extra: Record<string, string | null>) => {
    const p: Record<string, string> = { vista: "pagos-proveedores", desde: range.from, hasta: range.to };
    if (method) p.metodo = method;
    if (account) p.cuenta = account;
    for (const [k, v] of Object.entries(extra)) {
      if (v === null) delete p[k];
      else p[k] = v;
    }
    return `/reportes?${new URLSearchParams(p)}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 text-sm font-medium text-muted-foreground">Método</span>
        <Link href={href({ metodo: null })} className={pill(!method)}>
          Todos
        </Link>
        {METHODS.map((m) => (
          <Link key={m} href={href({ metodo: m })} className={pill(method === m)}>
            {SUPPLIER_METHOD_LABEL[m]}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 text-sm font-medium text-muted-foreground">Cuenta</span>
        <Link href={href({ cuenta: null })} className={pill(!account)}>
          Todas
        </Link>
        {MONEY_ACCOUNTS.map((a) => (
          <Link key={a} href={href({ cuenta: a })} className={pill(account === a)}>
            {MONEY_ACCOUNT_LABEL[a]}
          </Link>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total pagado" value={formatMoney(r.totalCents)} />
        <Stat label="Pagos" value={String(r.active.length)} />
        <Stat label="Anulados (no suman)" value={formatMoney(r.voidedCents)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TotalsTable
          title="Por método"
          rows={METHODS.map((m) => [SUPPLIER_METHOD_LABEL[m], r.byMethod[m]] as const)}
          totalCents={r.totalCents}
        />
        <TotalsTable
          title="Por cuenta"
          rows={MONEY_ACCOUNTS.map((a) => [MONEY_ACCOUNT_LABEL[a], r.byAccount[a]] as const)}
          totalCents={r.totalCents}
        />
      </div>

      <h2 className="text-lg font-semibold">Pagos</h2>
      <PaymentsTable rows={r.active} />
      {r.active.length === 0 && <p className="text-sm text-muted-foreground">No hay pagos en este período.</p>}

      {r.voided.length > 0 && (
        <>
          <h2 className="text-lg font-semibold">Anulados (no suman)</h2>
          <PaymentsTable rows={r.voided} voided />
        </>
      )}
    </div>
  );
}

function TotalsTable({ title, rows, totalCents }: { title: string; rows: readonly (readonly [string, number])[]; totalCents: number }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th className={th}>{title}</th>
            <th className={`${th} text-right`}>Monto</th>
          </tr>
        </thead>
        <tbody className="divide-y tabular-nums">
          {rows.map(([label, cents]) => (
            <tr key={label}>
              <td className="p-2">{label}</td>
              <td className="p-2 text-right">{formatMoney(cents)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 font-bold tabular-nums">
          <tr>
            <td className="p-2">Total</td>
            <td className="p-2 text-right">{formatMoney(totalCents)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

type Row = Awaited<ReturnType<typeof getSupplierPaymentsReport>>["active"][number];

function PaymentsTable({ rows, voided = false }: { rows: Row[]; voided?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-5xl text-sm">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th className={th}>Fecha</th>
            <th className={th}>Proveedor</th>
            <th className={th}>Compra</th>
            <th className={th}>Ítems / categoría</th>
            <th className={th}>Método</th>
            <th className={th}>Cuenta</th>
            <th className={th}>N° comprobante</th>
            <th className={`${th} text-right`}>Monto</th>
            <th className={th}>{voided ? "Motivo de anulación" : "Nota"}</th>
            <th className={th}>Registró</th>
          </tr>
        </thead>
        <tbody className={cn("divide-y", voided && "text-muted-foreground")}>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="p-2 whitespace-nowrap">
                {formatDay(p.date)}
                <span className="block text-xs text-muted-foreground">{time.format(p.createdAt)}</span>
              </td>
              <td className="p-2">{p.supplier ?? "Sin proveedor"}</td>
              <td className="p-2">
                <Link href={`/compras/${p.purchaseId}`} className="underline">
                  #{p.purchaseNumber}
                </Link>
              </td>
              <td className="p-2">{itemsText(p.items)}</td>
              <td className="p-2">{SUPPLIER_METHOD_LABEL[p.method]}</td>
              <td className="p-2">{MONEY_ACCOUNT_LABEL[p.account]}</td>
              <td className="p-2">{p.reference ?? "—"}</td>
              <td className={cn("p-2 text-right font-semibold tabular-nums", voided && "line-through")}>{formatMoney(p.amountCents)}</td>
              <td className="p-2">{voided ? `${p.voidReason ?? ""}${p.voidedByName ? ` (${p.voidedByName})` : ""}` : (p.note ?? "")}</td>
              <td className="p-2">{p.createdByName ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
