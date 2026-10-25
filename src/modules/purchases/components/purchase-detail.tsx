import { notFound } from "next/navigation";

import { formatDay } from "@/core/export";
import { formatMoney, formatMoneyInput } from "@/core/money";
import { formatQuantity } from "@/core/quantity";
import { businessDate } from "@/core/time";
import { formatUnitCost } from "@/modules/catalog";
import { cn } from "@/lib/utils";

import { cancelPurchaseAction, voidSupplierPaymentAction } from "../actions";
import { DOC_TYPE_LABEL, SUPPLIER_METHOD_LABEL } from "../domain/labels";
import { getPurchase } from "../services/purchases";
import { PaymentForm } from "./payment-form";
import { ReasonAction } from "./reason-action";
import { PurchaseStatusBadge } from "./status-badge";

export async function PurchaseDetail({ id }: { id: string }) {
  const p = await getPurchase(id);
  if (!p) notFound();
  const cancelled = p.status === "CANCELLED";
  const activePayments = p.payments.filter((x) => !x.voidedAt);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Compra #{p.number}</h1>
        <PurchaseStatusBadge status={p.paymentStatus} cancelled={cancelled} overdue={p.overdue} />
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="inline text-muted-foreground">Fecha: </dt>
          <dd className="inline">{formatDay(p.date)}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Proveedor: </dt>
          <dd className="inline">{p.supplier?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Comprobante: </dt>
          <dd className="inline">
            {DOC_TYPE_LABEL[p.docType]} {p.docNumber ?? ""}
          </dd>
        </div>
        {p.dueDate && (
          <div>
            <dt className="inline text-muted-foreground">Vence: </dt>
            <dd className={cn("inline", p.overdue && "font-semibold text-red-700 dark:text-red-400")}>{formatDay(p.dueDate)}</dd>
          </div>
        )}
        {p.note && <div className="sm:col-span-2">Nota: {p.note}</div>}
        {cancelled && (
          <div className="font-medium text-red-700 sm:col-span-2 dark:text-red-400">
            Anulada: {p.cancelReason} (el stock se revirtió)
          </div>
        )}
      </dl>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-xl text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="p-2">Ítem</th>
              <th className="p-2 text-right">Cantidad</th>
              <th className="p-2 text-right">En stock</th>
              <th className="p-2 text-right">Costo unit.</th>
              <th className="p-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {p.lines.map((l) => (
              <tr key={l.id}>
                <td className="p-2">{l.productName}</td>
                <td className="p-2 text-right tabular-nums">
                  {formatQuantity(l.quantity)} × {l.presentationName}
                </td>
                <td className="p-2 text-right tabular-nums">{l.addsStock ? `+${formatQuantity(l.baseQuantity)}` : "no suma"}</td>
                <td className="p-2 text-right tabular-nums">{formatUnitCost(l.unitCostCents)}</td>
                <td className="p-2 text-right tabular-nums">{formatMoney(l.totalCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 font-semibold">
            <tr>
              <td className="p-2" colSpan={4}>
                Total · pagado {formatMoney(p.paidCents)} · saldo {formatMoney(Math.max(0, p.balanceCents))}
              </td>
              <td className="p-2 text-right tabular-nums">{formatMoney(p.totalCents)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Pagos</h2>
        {p.payments.length === 0 && <p className="text-sm text-muted-foreground">Sin pagos todavía (crédito).</p>}
        <ul className="divide-y rounded-lg border">
          {p.payments.map((x) => (
            <li key={x.id} className={cn("flex flex-wrap items-center gap-3 p-3 text-sm", x.voidedAt && "opacity-60")}>
              <span className="w-24">{formatDay(x.date)}</span>
              <span className="w-44">{SUPPLIER_METHOD_LABEL[x.method]}</span>
              <span className={cn("w-28 text-right font-semibold tabular-nums", x.voidedAt && "line-through")}>{formatMoney(x.amountCents)}</span>
              <span className="flex-1 text-muted-foreground">
                {x.voidedAt ? `Anulado: ${x.voidReason}` : (x.note ?? "")}
              </span>
              {!x.voidedAt && !cancelled && (
                <ReasonAction label="Anular pago" confirmLabel="Anular" hidden={{ paymentId: x.id }} action={voidSupplierPaymentAction} />
              )}
            </li>
          ))}
        </ul>
        {!cancelled && p.balanceCents > 0 && (
          <PaymentForm purchaseId={p.id} today={businessDate()} balance={formatMoneyInput(p.balanceCents)} />
        )}
      </section>

      {!cancelled && (
        <section className="space-y-2 border-t pt-4">
          <h2 className="text-lg font-semibold">Anular compra</h2>
          <p className="text-sm text-muted-foreground">
            Revierte el stock que sumó. {activePayments.length > 0 && "Primero anula sus pagos."}
          </p>
          {activePayments.length === 0 && (
            <ReasonAction label="Anular compra" confirmLabel="Anular compra" hidden={{ id: p.id }} action={cancelPurchaseAction} size="default" />
          )}
        </section>
      )}
    </div>
  );
}
