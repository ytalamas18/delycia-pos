import { db } from "@/core/db/client";
import { MONEY_ACCOUNT_LABEL, MONEY_ACCOUNTS } from "@/core/money/accounts";
import { businessDate, businessDayRange } from "@/core/time";
import type { MoneyAccount } from "@/generated/prisma/enums";
import { listSupplierPayments, SUPPLIER_METHOD_LABEL } from "@/modules/purchases";
import { listDeposits, listOpeningBalances, listTransfers, listWithdrawalsInRange } from "@/modules/treasury";

import {
  accountForPaymentMethod,
  buildLedger,
  cashDifferences,
  SALES_LABEL,
  type LedgerMovement,
} from "../domain/cashbook";
import type { DateRange } from "../domain/range";
import { itemsText } from "../domain/supplier-payments";

/*
 * Libro de caja y bancos: SOLO LECTURA. Ventas, fiados, aperturas y cierres se leen con SQL (como el resto
 * de Reportes); pagos a proveedores, retiros, traspasos y saldos iniciales, por la API pública de Compras y
 * Caja y bancos. Se lee todo hasta el fin del período para calcular el saldo anterior.
 */

const FIRST_DAY = "2000-01-01";

export async function getCashbook(range: DateRange, account: MoneyAccount | null = null) {
  const end = businessDayRange(range.to).end;
  const [sales, collections, closings, payments, withdrawals, transfers, openings, deposits] = await Promise.all([
    // Igual que el cierre: pagos vigentes de órdenes cobradas, en el día de negocio de la orden. Fiado no es dinero.
    db.$queryRaw<{ day: string; method: string; totalCents: number }[]>`
      SELECT o."businessDate" AS day, p.method::text AS method, SUM(p."amountCents")::int AS "totalCents"
      FROM "Payment" p JOIN "Order" o ON o.id = p."orderId"
      WHERE o."businessDate" <= ${range.to}
        AND o.status IN ('PAID', 'CLOSED') AND p."refundedAt" IS NULL AND p.method <> 'CREDIT'
      GROUP BY 1, 2`,
    // Cobros de fiados: por la fecha del abono.
    db.$queryRaw<{ id: string; method: string; amountCents: number; createdAt: Date; debtorName: string | null; number: number; orderDay: string }[]>`
      SELECT c.id, c.method::text AS method, c."amountCents", c."createdAt", p."debtorName", o.number, o."businessDate" AS "orderDay"
      FROM "CreditCollection" c JOIN "Payment" p ON p.id = c."paymentId" JOIN "Order" o ON o.id = p."orderId"
      WHERE c."createdAt" < ${end}`,
    db.$queryRaw<{ date: string; countedCashCents: number; openingCashCents: number }[]>`
      SELECT c."businessDate" AS date, c."countedCashCents", COALESCE(o."openingCashCents", 0)::int AS "openingCashCents"
      FROM "CashClosing" c LEFT JOIN "CashOpening" o ON o."businessDate" = c."businessDate"
      WHERE c."businessDate" <= ${range.to}`,
    listSupplierPayments({ from: FIRST_DAY, to: range.to }),
    listWithdrawalsInRange({ to: range.to }),
    listTransfers({ to: range.to }),
    listOpeningBalances(),
    listDeposits({ to: range.to }),
  ]);

  const movements: LedgerMovement[] = [];
  for (const s of sales) {
    const acc = accountForPaymentMethod(s.method);
    if (acc) movements.push({ date: s.day, at: null, account: acc, kind: "SALES", detail: SALES_LABEL[s.method] ?? s.method, amountCents: s.totalCents });
  }
  for (const c of collections) {
    const acc = accountForPaymentMethod(c.method);
    if (!acc) continue;
    movements.push({
      date: businessDate(c.createdAt),
      at: c.createdAt,
      account: acc,
      kind: "COLLECTION",
      detail: `Cobro de fiado${c.debtorName ? ` — ${c.debtorName}` : ""} (orden #${c.number} del ${c.orderDay.split("-").reverse().join("/")})`,
      amountCents: c.amountCents,
    });
  }
  for (const p of payments) {
    if (p.voidedAt) continue;
    movements.push({
      date: p.date,
      at: p.createdAt,
      account: p.account,
      kind: "SUPPLIER_PAYMENT",
      detail: `Pago a ${p.supplier ?? "proveedor"} — compra #${p.purchaseNumber} (${SUPPLIER_METHOD_LABEL[p.method]})${p.note ? ` · ${p.note}` : ""}`,
      items: itemsText(p.items),
      reference: p.reference,
      amountCents: -p.amountCents,
    });
  }
  for (const w of withdrawals) {
    if (w.voidedAt) continue;
    const at = new Date(w.at);
    if (w.kind === "RELIEF") {
      // Alivio: no es gasto; la plata pasa de la caja a "Por depositar" (la lleva alguien al banco).
      const note = w.reason && w.reason !== "Alivio" ? ` · ${w.reason}` : "";
      const who = w.carriedByName ?? "—";
      movements.push({ date: w.businessDate, at, account: "CASH", kind: "RELIEF", detail: `Alivio — lleva ${who}${note}`, amountCents: -w.amountCents });
      movements.push({
        date: w.businessDate,
        at,
        account: "PENDING_DEPOSIT",
        kind: "RELIEF",
        detail: `Alivio de caja — lleva ${who}${w.depositId ? "" : " (pendiente de depositar)"}${note}`,
        amountCents: w.amountCents,
      });
      continue;
    }
    movements.push({
      date: w.businessDate,
      at,
      account: "CASH",
      kind: "WITHDRAWAL",
      detail: `Retiro del dueño: ${w.reason}${w.byName ? ` (${w.byName})` : ""}`,
      amountCents: -w.amountCents,
    });
  }
  for (const d of deposits) {
    if (d.voidedAt) continue;
    const base = { date: d.date, at: d.createdAt, reference: d.reference };
    const who = [...new Set(d.reliefs.map((r) => r.carriedByName ?? "—"))].join(", ");
    const covers = `${d.reliefs.length} alivio${d.reliefs.length === 1 ? "" : "s"} (${d.reliefs
      .map((r) => r.businessDate.split("-").reverse().slice(0, 2).join("/"))
      .join(", ")}) · llevó ${who}${d.note ? ` · ${d.note}` : ""}`;
    movements.push({ ...base, account: "PENDING_DEPOSIT", kind: "DEPOSIT", detail: `Depósito al banco — ${covers}`, amountCents: -d.amountCents });
    movements.push({ ...base, account: "BANK", kind: "DEPOSIT", detail: `Depósito de alivios — ${covers}`, amountCents: d.amountCents });
    if (d.differenceCents !== 0) {
      movements.push({
        ...base,
        account: "PENDING_DEPOSIT",
        kind: "DEPOSIT_DIFFERENCE",
        detail: `Diferencia de depósito (${d.differenceCents < 0 ? "faltante" : "sobrante"}): ${d.differenceReason ?? ""}`,
        amountCents: d.differenceCents,
      });
    }
  }
  for (const t of transfers) {
    if (t.voidedAt) continue;
    const base = { date: t.date, at: t.createdAt, reference: t.reference };
    const note = t.note ? ` · ${t.note}` : "";
    movements.push({
      ...base,
      account: t.fromAccount,
      kind: "TRANSFER_OUT",
      detail: `Depósito / traspaso a ${MONEY_ACCOUNT_LABEL[t.toAccount]}${note}`,
      amountCents: -t.amountInCents,
    });
    if (t.commissionCents > 0) {
      movements.push({
        ...base,
        account: t.fromAccount,
        kind: "COMMISSION",
        detail: `Comisión del depósito a ${MONEY_ACCOUNT_LABEL[t.toAccount]}`,
        amountCents: -t.commissionCents,
      });
    }
    movements.push({
      ...base,
      account: t.toAccount,
      kind: "TRANSFER_IN",
      detail: `Depósito / traspaso desde ${MONEY_ACCOUNT_LABEL[t.fromAccount]}${note}`,
      amountCents: t.amountInCents,
    });
  }

  const activeOpenings = openings.filter((o) => !o.voidedAt);
  const cashOpening = activeOpenings.find((o) => o.account === "CASH");
  const closingsInBook = closings.filter((c) => !cashOpening || c.date >= cashOpening.date);
  movements.push(...cashDifferences(movements, closingsInBook));

  const ledger = buildLedger({
    movements,
    openings: activeOpenings.map((o) => ({ account: o.account, date: o.date, amountCents: o.amountCents })),
    range,
    account,
  });
  return { ...ledger, openings, missingOpenings: MONEY_ACCOUNTS.filter((a) => !activeOpenings.some((o) => o.account === a)) };
}

export type Cashbook = Awaited<ReturnType<typeof getCashbook>>;
