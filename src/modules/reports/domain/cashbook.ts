import { LEDGER_ACCOUNTS } from "@/core/money/accounts";
import type { MoneyAccount } from "@/generated/prisma/enums";

/*
 * Libro de caja y bancos (reemplaza el cuaderno Fecha / Detalle / Ingreso / Egreso / Saldo).
 * Se arma solo con lo que ya registra el sistema; esta parte es pura (sin base) para poder probarla.
 */

export { LEDGER_ACCOUNTS };

export type LedgerKind =
  | "OPENING"
  | "SALES"
  | "COLLECTION"
  | "SUPPLIER_PAYMENT"
  | "WITHDRAWAL"
  | "RELIEF"
  | "DEPOSIT"
  | "DEPOSIT_DIFFERENCE"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "COMMISSION"
  | "CASH_DIFFERENCE";

export const LEDGER_KIND_LABEL: Record<LedgerKind, string> = {
  OPENING: "Saldo inicial",
  SALES: "Ventas",
  COLLECTION: "Cobro de fiado",
  SUPPLIER_PAYMENT: "Pago a proveedor",
  WITHDRAWAL: "Retiro del dueño",
  RELIEF: "Alivio",
  DEPOSIT: "Depósito de alivios",
  DEPOSIT_DIFFERENCE: "Diferencia de depósito",
  TRANSFER_OUT: "Traspaso (sale)",
  TRANSFER_IN: "Traspaso (llega)",
  COMMISSION: "Comisión",
  CASH_DIFFERENCE: "Diferencia de arqueo",
};

/** Un movimiento de una cuenta. `amountCents` > 0 = ingreso, < 0 = egreso. */
export type LedgerMovement = {
  /** Día "YYYY-MM-DD" en que cuenta. */
  date: string;
  /** Hora real (para ordenar dentro del día); null en los resúmenes del día (ventas, arqueo). */
  at: Date | null;
  account: MoneyAccount;
  kind: LedgerKind;
  detail: string;
  /** Ítems y categoría (pagos a proveedores), para distinguir "Gastos operativos" de mercadería. */
  items?: string | null;
  reference?: string | null;
  amountCents: number;
};

export type OpeningBalance = { account: MoneyAccount; date: string; amountCents: number };
export type ClosingCash = { date: string; openingCashCents: number; countedCashCents: number };

export type LedgerLine = LedgerMovement & {
  inCents: number;
  outCents: number;
  /** Saldo de la cuenta del movimiento después de él. */
  balanceCents: number;
  /** Saldo de todas las cuentas mostradas después de él. */
  totalBalanceCents: number;
};

export type AccountSummary = {
  account: MoneyAccount;
  /** Saldo antes del período (incluye un saldo inicial anterior). */
  beforeCents: number;
  /** Saldo inicial cargado DENTRO del período (no es ingreso). */
  openingCents: number;
  inCents: number;
  outCents: number;
  endCents: number;
};

export type Ledger = { accounts: AccountSummary[]; lines: LedgerLine[]; total: Omit<AccountSummary, "account"> };

// Dentro de un día: saldo inicial, movimientos con hora, ventas del día y, al final, la diferencia de arqueo.
const KIND_ORDER: Record<LedgerKind, number> = {
  OPENING: 0,
  COLLECTION: 1,
  SUPPLIER_PAYMENT: 1,
  WITHDRAWAL: 1,
  RELIEF: 1,
  DEPOSIT: 1,
  DEPOSIT_DIFFERENCE: 1,
  TRANSFER_OUT: 1,
  TRANSFER_IN: 1,
  COMMISSION: 1,
  SALES: 2,
  CASH_DIFFERENCE: 3,
};
const ACCOUNT_ORDER: Record<MoneyAccount, number> = { CASH: 0, PENDING_DEPOSIT: 1, BANK: 2, ATC_PEYA: 3 };

function compare(a: LedgerMovement, b: LedgerMovement): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  const ta = a.at?.getTime() ?? 0;
  const tb = b.at?.getTime() ?? 0;
  if (ta !== tb) return ta - tb;
  return ACCOUNT_ORDER[a.account] - ACCOUNT_ORDER[b.account];
}

/**
 * Diferencia de arqueo de cada día con cierre guardado: contado − (fondo + movimientos del día en Efectivo).
 * Con ella, el saldo de Efectivo de cada día cambia exactamente lo que dice el cierre (contado − fondo).
 */
export function cashDifferences(movements: LedgerMovement[], closings: ClosingCash[]): LedgerMovement[] {
  const netByDay = new Map<string, number>();
  for (const m of movements) {
    if (m.account !== "CASH" || m.kind === "OPENING" || m.kind === "CASH_DIFFERENCE") continue;
    netByDay.set(m.date, (netByDay.get(m.date) ?? 0) + m.amountCents);
  }
  return closings
    .map((c) => ({ c, diff: c.countedCashCents - c.openingCashCents - (netByDay.get(c.date) ?? 0) }))
    .filter(({ diff }) => diff !== 0)
    .map(({ c, diff }) => ({
      date: c.date,
      at: null,
      account: "CASH" as const,
      kind: "CASH_DIFFERENCE" as const,
      detail: `Diferencia de arqueo del cierre (${diff < 0 ? "faltante" : "sobrante"})`,
      amountCents: diff,
    }));
}

/**
 * Arma el libro: movimientos en orden cronológico con saldo acumulado por cuenta y total.
 * - Un saldo inicial fija el punto de partida de su cuenta: lo anterior a su fecha no cuenta en esa cuenta.
 * - Lo anterior a `range.from` se resume en el "saldo anterior".
 * - Con `account`, solo esa cuenta (y el total es el de esa cuenta).
 */
export function buildLedger(input: {
  movements: LedgerMovement[];
  openings: OpeningBalance[];
  range: { from: string; to: string };
  account?: MoneyAccount | null;
}): Ledger {
  const accounts = input.account ? [input.account] : [...LEDGER_ACCOUNTS];
  const openingOf = new Map(input.openings.map((o) => [o.account, o]));
  const all: LedgerMovement[] = [
    ...input.openings.map((o) => ({
      date: o.date,
      at: null,
      account: o.account,
      kind: "OPENING" as const,
      detail: "Saldo inicial",
      amountCents: o.amountCents,
    })),
    ...input.movements.filter((m) => {
      const o = openingOf.get(m.account);
      return !o || m.date >= o.date;
    }),
  ]
    .filter((m) => accounts.includes(m.account) && m.date <= input.range.to)
    .sort(compare);

  const summary = new Map<MoneyAccount, AccountSummary>(
    accounts.map((a) => [a, { account: a, beforeCents: 0, openingCents: 0, inCents: 0, outCents: 0, endCents: 0 }]),
  );
  const balance = new Map<MoneyAccount, number>(accounts.map((a) => [a, 0]));
  const lines: LedgerLine[] = [];
  for (const m of all) {
    const s = summary.get(m.account)!;
    const next = balance.get(m.account)! + m.amountCents;
    balance.set(m.account, next);
    if (m.date < input.range.from) {
      s.beforeCents += m.amountCents;
      continue;
    }
    if (m.kind === "OPENING") s.openingCents += m.amountCents;
    else if (m.amountCents >= 0) s.inCents += m.amountCents;
    else s.outCents += -m.amountCents;
    lines.push({
      ...m,
      // El saldo inicial no es ingreso ni egreso: solo fija el saldo.
      inCents: m.kind !== "OPENING" && m.amountCents > 0 ? m.amountCents : 0,
      outCents: m.kind !== "OPENING" && m.amountCents < 0 ? -m.amountCents : 0,
      balanceCents: next,
      totalBalanceCents: [...balance.values()].reduce((x, y) => x + y, 0),
    });
  }
  for (const s of summary.values()) s.endCents = balance.get(s.account)!;
  const list = [...summary.values()];
  const sum = (k: keyof Omit<AccountSummary, "account">) => list.reduce((x, s) => x + s[k], 0);
  return {
    accounts: list,
    lines,
    total: { beforeCents: sum("beforeCents"), openingCents: sum("openingCents"), inCents: sum("inCents"), outCents: sum("outCents"), endCents: sum("endCents") },
  };
}

/** Cuenta del libro donde cae cada medio de cobro (PEYA y tarjeta van a ATC / PeYa). Fiado: null (no es dinero). */
export function accountForPaymentMethod(method: string): MoneyAccount | null {
  if (method === "CASH") return "CASH";
  if (method === "QR") return "BANK";
  if (method === "CARD" || method === "PEYA") return "ATC_PEYA";
  return null;
}

export const SALES_LABEL: Record<string, string> = {
  CASH: "Ventas en efectivo",
  QR: "Ventas por QR",
  CARD: "Ventas con tarjeta",
  PEYA: "Ventas PeYa",
};
