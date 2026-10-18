import type { Cents } from "@/core/money";

import { textKey } from "./text";

/** Una cuenta fiada (un pago CUENTA POR COBRAR de una orden) con sus abonos. */
export type CreditAccount = {
  paymentId: string;
  orderId: string;
  orderNumber: number;
  orderDate: string;
  customer: string;
  amountCents: Cents;
  collections: { method: string; amountCents: Cents; at: Date }[];
  settledAt: Date | null;
};

export type CreditStatusFilter = "todas" | "pendiente" | "pagada";

export function parseCreditStatus(value: string | undefined): CreditStatusFilter {
  return value === "pendiente" || value === "pagada" ? value : "todas";
}

export type CreditRow = CreditAccount & {
  collectedCents: Cents;
  balanceCents: Cents;
  status: "pendiente" | "pagada";
  /** Métodos con los que se pagó (ej. "EFECTIVO + QR"). */
  methods: string[];
};

export type CustomerRow = { customer: string; accounts: number; amountCents: Cents; collectedCents: Cents; balanceCents: Cents };

export type ReceivablesReport = {
  rows: CreditRow[];
  totals: { accounts: number; amountCents: Cents; collectedCents: Cents; balanceCents: Cents };
  byCustomer: CustomerRow[];
  customers: string[];
};

/**
 * Arma el reporte: saldo y estado de cada cuenta, filtros (estado y cliente) y el total por cliente.
 * El cliente es el nombre escrito al fiar: "Don Pedro" y "don pedro " son el mismo.
 */
export function buildReceivables(
  accounts: CreditAccount[],
  filters: { status?: CreditStatusFilter; customer?: string | null } = {},
): ReceivablesReport {
  const all: CreditRow[] = accounts.map((a) => {
    const collectedCents = a.collections.reduce((s, c) => s + c.amountCents, 0);
    const balanceCents = a.amountCents - collectedCents;
    return {
      ...a,
      collectedCents,
      balanceCents,
      status: a.settledAt || balanceCents <= 0 ? "pagada" : "pendiente",
      methods: [...new Set(a.collections.map((c) => c.method))],
    };
  });

  // Nombre a mostrar por cliente: el más reciente que se escribió.
  const displayName = new Map<string, string>();
  for (const r of [...all].sort((a, b) => a.orderDate.localeCompare(b.orderDate))) displayName.set(textKey(r.customer), r.customer.trim());
  const customers = [...new Set(all.map((r) => displayName.get(textKey(r.customer))!))].sort((a, b) => a.localeCompare(b));

  const wanted = filters.customer ? textKey(filters.customer) : null;
  const rows = all
    .filter((r) => !filters.status || filters.status === "todas" || r.status === filters.status)
    .filter((r) => !wanted || textKey(r.customer) === wanted)
    .map((r) => ({ ...r, customer: displayName.get(textKey(r.customer))! }))
    .sort((a, b) => a.orderDate.localeCompare(b.orderDate) || a.orderNumber - b.orderNumber);

  const groups = new Map<string, CustomerRow>();
  for (const r of rows) {
    const g = groups.get(r.customer) ?? { customer: r.customer, accounts: 0, amountCents: 0, collectedCents: 0, balanceCents: 0 };
    g.accounts += 1;
    g.amountCents += r.amountCents;
    g.collectedCents += r.collectedCents;
    g.balanceCents += r.balanceCents;
    groups.set(r.customer, g);
  }

  return {
    rows,
    totals: {
      accounts: rows.length,
      amountCents: rows.reduce((s, r) => s + r.amountCents, 0),
      collectedCents: rows.reduce((s, r) => s + r.collectedCents, 0),
      balanceCents: rows.reduce((s, r) => s + r.balanceCents, 0),
    },
    byCustomer: [...groups.values()].sort((a, b) => b.balanceCents - a.balanceCents || a.customer.localeCompare(b.customer)),
    customers,
  };
}

/** Dinero que entró en el período por medio: ventas cobradas (sin fiado) + abonos de fiados. */
export type MoneyInRow = { channel: string; salesCents: Cents; collectionsCents: Cents; totalCents: Cents };

export function buildMoneyIn(
  sales: { channel: string; totalCents: Cents }[],
  collections: { channel: string; totalCents: Cents }[],
  order: (channels: string[]) => string[],
): { rows: MoneyInRow[]; totals: Omit<MoneyInRow, "channel">; creditSalesCents: Cents } {
  const creditSalesCents = sales.filter((s) => s.channel === "CREDIT").reduce((s, x) => s + x.totalCents, 0);
  // Lo fiado es venta pero no dinero: entra recién cuando se abona.
  const cash = sales.filter((s) => s.channel !== "CREDIT");
  const channels = order([...cash, ...collections].map((x) => x.channel));
  const sum = (list: { channel: string; totalCents: Cents }[], c: string) =>
    list.filter((x) => x.channel === c).reduce((s, x) => s + x.totalCents, 0);
  const rows = channels
    .map((c) => {
      const salesCents = sum(cash, c);
      const collectionsCents = sum(collections, c);
      return { channel: c, salesCents, collectionsCents, totalCents: salesCents + collectionsCents };
    })
    .filter((r) => r.totalCents > 0);
  return {
    rows,
    totals: {
      salesCents: rows.reduce((s, r) => s + r.salesCents, 0),
      collectionsCents: rows.reduce((s, r) => s + r.collectionsCents, 0),
      totalCents: rows.reduce((s, r) => s + r.totalCents, 0),
    },
    creditSalesCents,
  };
}
