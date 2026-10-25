import { fileBaseFor, formatPeriod, type ExportDocument } from "@/core/export";
import { formatMoney as formatMoneyText } from "@/core/money";

import { formatQuantity } from "@/core/quantity";
import { businessDate } from "@/core/time";
import { formatUnitCostInput, ITEM_TYPE_LABEL, UNIT_SHORT } from "@/modules/catalog";
import { MOVEMENT_LABEL, STOCK_LEVEL_LABEL } from "@/modules/inventory";
import { DOC_TYPE_LABEL, PAYMENT_STATUS_LABEL, SUPPLIER_METHOD_LABEL } from "@/modules/purchases";

import { channelName } from "./domain/labels";
import { parseCreditStatus } from "./domain/receivables";
import { parseRange } from "./domain/range";
import { getAdjustmentsReport, getKardexReport, getPayablesReport, getPurchasesReport, getStockReport } from "./services/stock-purchases";
import { getMoneyIn, getProductsSold, getReceivables, getSalesByChannel, getVoids, listCategoriesForFilter } from "./services/reports";

/** Parámetros de la URL: los mismos que usa la pantalla de Reportes. */
export type ReportParams = {
  desde?: string;
  hasta?: string;
  cat?: string;
  orden?: string;
  estado?: string;
  cliente?: string;
  tipo?: string;
  item?: string;
  [key: string]: string | undefined;
};


async function salesByChannelExport(params: ReportParams): Promise<ExportDocument> {
  const range = parseRange(params);
  const [r, money] = await Promise.all([getSalesByChannel(range), getMoneyIn(range)]);
  const channels = r.channels.filter((c) => r.totals.byChannel[c].orders > 0);
  const total = r.totals.total.totalCents;
  return {
    report: "Ventas por canal",
    fileBase: fileBaseFor("ventas-por-canal", range.from, range.to),
    period: formatPeriod(range.from, range.to),
    filters: ["Solo órdenes cobradas; anuladas aparte"],
    generatedAt: new Date(),
    summary: [
      { label: "Total vendido", value: total, type: "money" },
      { label: "Órdenes cobradas", value: r.totals.total.orders, type: "int" },
      { label: "Ticket promedio", value: r.totals.total.averageCents, type: "money" },
      { label: "Anuladas (no suman)", value: r.totals.cancelled.totalCents, type: "money" },
    ],
    tables: [
      {
        title: "Por canal",
        columns: [
          { header: "Canal", type: "text" },
          { header: "Órdenes", type: "int" },
          { header: "Total", type: "money" },
          { header: "Ticket promedio", type: "money" },
          { header: "% del total", type: "percent" },
        ],
        rows: channels.map((c) => {
          const x = r.totals.byChannel[c];
          return [channelName(c), x.orders, x.totalCents, x.averageCents, total ? x.totalCents / total : 0];
        }),
        totals: ["Total del período", r.totals.total.orders, total, r.totals.total.averageCents, total ? 1 : 0],
        notes: ["Una orden pagada con dos medios cuenta en los dos canales, pero una sola vez en el total."],
      },
      {
        title: "Dinero cobrado",
        columns: [
          { header: "Medio", type: "text" },
          { header: "Ventas cobradas", type: "money" },
          { header: "Abonos de fiados", type: "money" },
          { header: "Total entró", type: "money" },
        ],
        rows: money.rows.map((m) => [channelName(m.channel), m.salesCents, m.collectionsCents, m.totalCents]),
        totals: ["Total", money.totals.salesCents, money.totals.collectionsCents, money.totals.totalCents],
        notes: [
          `Lo fiado es venta pero no dinero: en el período se fiaron ${formatMoneyText(money.creditSalesCents)}; entra cuando se abona.`,
        ],
      },
      {
        // Formato "largo" (una fila por día y canal): ideal para tablas dinámicas.
        title: "Por día y canal",
        columns: [
          { header: "Día", type: "date" },
          { header: "Canal", type: "text" },
          { header: "Órdenes", type: "int" },
          { header: "Total", type: "money" },
          { header: "Ticket promedio", type: "money" },
        ],
        rows: r.days.flatMap((d) =>
          channels
            .filter((c) => d.byChannel[c].orders > 0)
            .map((c) => [d.day, channelName(c), d.byChannel[c].orders, d.byChannel[c].totalCents, d.byChannel[c].averageCents]),
        ),
        totals: ["Total", null, null, total, null],
      },
      {
        title: "Totales por día",
        columns: [
          { header: "Día", type: "date" },
          { header: "Órdenes", type: "int" },
          { header: "Total", type: "money" },
          { header: "Ticket promedio", type: "money" },
          { header: "Anuladas", type: "int" },
          { header: "Monto anulado", type: "money" },
        ],
        rows: r.days
          .filter((d) => d.total.orders > 0 || d.cancelled.orders > 0)
          .map((d) => [d.day, d.total.orders, d.total.totalCents, d.total.averageCents, d.cancelled.orders, d.cancelled.totalCents]),
        totals: [
          "Total",
          r.totals.total.orders,
          total,
          r.totals.total.averageCents,
          r.totals.cancelled.orders,
          r.totals.cancelled.totalCents,
        ],
      },
    ],
  };
}

async function productsExport(params: ReportParams): Promise<ExportDocument> {
  const range = parseRange(params);
  const sort = params.orden === "monto" ? "monto" : "cantidad";
  const [r, categories] = await Promise.all([
    getProductsSold(range, { categoryId: params.cat ?? null, sort }),
    listCategoriesForFilter(),
  ]);
  const category = categories.find((c) => c.id === params.cat)?.name;
  const columns = [
    { header: "Producto", type: "text" as const },
    { header: "Categoría", type: "text" as const },
    { header: "Cantidad", type: "int" as const },
    { header: "Total", type: "money" as const },
  ];
  const rows = (list: typeof r.products) => list.map((p) => [p.name, p.category ?? "Sin categoría", p.quantity, p.totalCents]);
  return {
    report: "Productos vendidos",
    fileBase: fileBaseFor(category ? `productos-vendidos_${slug(category)}` : "productos-vendidos", range.from, range.to),
    period: formatPeriod(range.from, range.to),
    filters: [`Categoría: ${category ?? "Todas"}`, `Orden: por ${sort}`],
    generatedAt: new Date(),
    summary: [
      { label: "Ítems vendidos", value: r.totals.quantity, type: "int" },
      { label: "Total (antes de descuentos)", value: r.totals.totalCents, type: "money" },
      { label: "Anulados (no suman)", value: r.voided.totalCents, type: "money" },
    ],
    tables: [
      {
        title: "Productos vendidos",
        columns,
        rows: rows(r.products),
        totals: ["Total", null, r.totals.quantity, r.totals.totalCents],
        notes: ["Precio cobrado en cada orden (con recargo PEYA y modificadores), antes del descuento de la orden."],
      },
      { title: "Anulados", columns, rows: rows(r.voided.products), totals: ["Total", null, r.voided.quantity, r.voided.totalCents] },
    ],
  };
}

async function voidsExport(params: ReportParams): Promise<ExportDocument> {
  const range = parseRange(params);
  const r = await getVoids(range);
  return {
    report: "Anulaciones",
    fileBase: fileBaseFor("anulaciones", range.from, range.to),
    period: formatPeriod(range.from, range.to),
    filters: ["Por la hora en que se anuló"],
    generatedAt: new Date(),
    summary: [
      { label: "Anulaciones", value: r.totals.count, type: "int" },
      { label: "Monto anulado", value: r.totals.amountCents, type: "money" },
      { label: "Órdenes completas", value: r.totals.orders, type: "int" },
      { label: "Ítems sueltos", value: r.totals.items, type: "int" },
    ],
    tables: [
      {
        title: "Por motivo",
        columns: [
          { header: "Motivo", type: "text" },
          { header: "Veces", type: "int" },
          { header: "Monto", type: "money" },
        ],
        rows: r.byReason.map((g) => [g.reason, g.count, g.amountCents]),
        totals: ["Total", r.totals.count, r.totals.amountCents],
      },
      {
        title: "Detalle",
        columns: [
          { header: "Fecha y hora", type: "datetime" },
          { header: "N° orden", type: "int" },
          { header: "Día de la orden", type: "date" },
          { header: "Tipo", type: "text" },
          { header: "Producto(s)", type: "text" },
          { header: "Monto", type: "money" },
          { header: "Motivo", type: "text" },
          { header: "Anuló", type: "text" },
          { header: "Autorizó", type: "text" },
          { header: "En cocina", type: "text" },
          { header: "Cobrada", type: "text" },
        ],
        rows: r.entries.map((e) => [
          e.at,
          e.orderNumber,
          e.orderDate,
          e.kind === "order" ? "Orden completa" : "Ítem",
          e.products,
          e.amountCents,
          e.reason,
          e.voidedBy,
          e.authorizedBy ?? "",
          e.inKitchen ? "Sí" : "No",
          e.wasPaid ? "Sí (devuelta)" : "No",
        ]),
        totals: ["Total", null, null, null, null, r.totals.amountCents, null, null, null, null, null],
      },
    ],
  };
}

async function receivablesExport(params: ReportParams): Promise<ExportDocument> {
  const range = parseRange(params);
  const status = parseCreditStatus(params.estado);
  const r = await getReceivables(range, { status, customer: params.cliente || null });
  const statusLabel = { todas: "Todas", pendiente: "Pendientes", pagada: "Pagadas" }[status];
  return {
    report: "Cuentas por cobrar",
    fileBase: fileBaseFor(params.cliente ? `cuentas-por-cobrar_${slug(params.cliente)}` : "cuentas-por-cobrar", range.from, range.to),
    period: formatPeriod(range.from, range.to),
    filters: [`Estado: ${statusLabel}`, `Cliente: ${params.cliente || "Todos"}`, "Por día de la orden"],
    generatedAt: new Date(),
    summary: [
      { label: "Total fiado", value: r.totals.amountCents, type: "money" },
      { label: "Total cobrado", value: r.totals.collectedCents, type: "money" },
      { label: "Pendiente", value: r.totals.balanceCents, type: "money" },
      { label: "Cuentas", value: r.totals.accounts, type: "int" },
    ],
    tables: [
      {
        title: "Por cliente",
        columns: [
          { header: "Cliente", type: "text" },
          { header: "Cuentas", type: "int" },
          { header: "Fiado", type: "money" },
          { header: "Cobrado", type: "money" },
          { header: "Debe", type: "money" },
        ],
        rows: r.byCustomer.map((c) => [c.customer, c.accounts, c.amountCents, c.collectedCents, c.balanceCents]),
        totals: ["Total", r.totals.accounts, r.totals.amountCents, r.totals.collectedCents, r.totals.balanceCents],
      },
      {
        title: "Cuentas",
        columns: [
          { header: "Cliente", type: "text" },
          { header: "Fecha orden", type: "date" },
          { header: "N° orden", type: "int" },
          { header: "Monto", type: "money" },
          { header: "Abonado", type: "money" },
          { header: "Saldo", type: "money" },
          { header: "Estado", type: "text" },
          { header: "Fecha de pago", type: "datetime" },
          { header: "Método de pago", type: "text" },
        ],
        rows: r.rows.map((a) => [
          a.customer,
          a.orderDate,
          a.orderNumber,
          a.amountCents,
          a.collectedCents,
          a.balanceCents,
          a.status === "pagada" ? "Pagada" : "Pendiente",
          a.settledAt,
          a.methods.map(channelName).join(" + "),
        ]),
        totals: ["Total", null, null, r.totals.amountCents, r.totals.collectedCents, r.totals.balanceCents, null, null, null],
      },
    ],
  };
}

// --- Inventario y compras ---

const dec = (v: { toNumber(): number } | null | undefined) => (v ? v.toNumber() : null);
/** Valor en centavos con decimales → centavos enteros (para columnas de dinero). */
const cents = (v: { toNumber(): number } | null | undefined) => (v ? Math.round(v.toNumber()) : null);

async function stockExport(params: ReportParams, onlyAlerts: boolean): Promise<ExportDocument> {
  const r = await getStockReport({ type: params.tipo ?? null, categoryId: params.cat ?? null, onlyAlerts });
  const today = businessDate();
  return {
    report: onlyAlerts ? "Stock bajo" : "Stock actual",
    fileBase: fileBaseFor(onlyAlerts ? "stock-bajo" : "stock-actual", today),
    period: `Al ${formatPeriod(today, today)}`,
    filters: [`Tipo: ${params.tipo ? ITEM_TYPE_LABEL[params.tipo as keyof typeof ITEM_TYPE_LABEL] : "Todos"}`],
    generatedAt: new Date(),
    summary: [
      { label: "Ítems", value: r.items.length, type: "int" },
      { label: "Valor del inventario", value: cents(r.totalValueCents), type: "money" },
    ],
    tables: [
      {
        title: onlyAlerts ? "Stock bajo" : "Stock",
        columns: [
          { header: "Ítem", type: "text" },
          { header: "Tipo", type: "text" },
          { header: "Categoría", type: "text" },
          { header: "Cantidad", type: "text" },
          { header: "Unidad", type: "text" },
          { header: "Mínimo", type: "text" },
          { header: "Costo unit. (Bs)", type: "text" },
          { header: "Valor", type: "money" },
          { header: "Estado", type: "text" },
        ],
        rows: r.items.map((i) => [
          i.name,
          ITEM_TYPE_LABEL[i.type],
          i.category.name,
          formatQuantity(i.stock),
          UNIT_SHORT[i.baseUnit],
          i.minStock ? formatQuantity(i.minStock) : "",
          i.lastCostCents ? formatUnitCostInput(i.lastCostCents) : "",
          cents(i.valueCents),
          i.level === "ok" ? "" : STOCK_LEVEL_LABEL[i.level],
        ]),
        totals: ["Total", null, null, null, null, null, null, cents(r.totalValueCents), null],
        notes: ["Valor = cantidad × último costo (los negativos no suman al total)."],
      },
    ],
  };
}

async function kardexExport(params: ReportParams): Promise<ExportDocument> {
  const range = parseRange(params);
  const r = await getKardexReport(params.item ?? null, range);
  return {
    report: `Kárdex${r.item ? ` - ${r.item.name}` : ""}`,
    fileBase: fileBaseFor(r.item ? `kardex_${slug(r.item.name)}` : "kardex", range.from, range.to),
    period: formatPeriod(range.from, range.to),
    filters: [r.item ? `Unidad: ${UNIT_SHORT[r.item.baseUnit]}` : "Sin ítem elegido"],
    generatedAt: new Date(),
    summary: [{ label: "Saldo inicial", value: dec(r.opening), type: "int" }],
    tables: [
      {
        title: "Movimientos",
        columns: [
          { header: "Fecha y hora", type: "datetime" },
          { header: "Movimiento", type: "text" },
          { header: "Nota", type: "text" },
          { header: "Cantidad", type: "text" },
          { header: "Saldo", type: "text" },
        ],
        rows: r.rows.map((m) => [m.at, MOVEMENT_LABEL[m.type], m.note ?? "", formatQuantity(m.quantity), formatQuantity(m.balance)]),
      },
    ],
  };
}

async function adjustmentsExport(params: ReportParams): Promise<ExportDocument> {
  const range = parseRange(params);
  const r = await getAdjustmentsReport(range);
  return {
    report: "Mermas y ajustes",
    fileBase: fileBaseFor("mermas", range.from, range.to),
    period: formatPeriod(range.from, range.to),
    filters: ["Diferencias de conteo físico"],
    generatedAt: new Date(),
    summary: [
      { label: "Ajustes", value: r.rows.length, type: "int" },
      { label: "Valor perdido", value: cents(r.lostCents), type: "money" },
      { label: "Sobrantes", value: cents(r.surplusCents), type: "money" },
    ],
    tables: [
      {
        title: "Ajustes",
        columns: [
          { header: "Fecha", type: "date" },
          { header: "Ítem", type: "text" },
          { header: "Sistema", type: "text" },
          { header: "Contado", type: "text" },
          { header: "Diferencia", type: "text" },
          { header: "Valor", type: "money" },
          { header: "Motivo", type: "text" },
        ],
        rows: r.rows.map((a) => [
          a.date,
          a.productName,
          formatQuantity(a.expected),
          formatQuantity(a.counted),
          formatQuantity(a.difference),
          cents(a.valueCents),
          a.reason ?? "",
        ]),
      },
    ],
  };
}

async function purchasesExport(params: ReportParams): Promise<ExportDocument> {
  const range = parseRange(params);
  const r = await getPurchasesReport(range);
  return {
    report: "Compras",
    fileBase: fileBaseFor("compras", range.from, range.to),
    period: formatPeriod(range.from, range.to),
    filters: ["Compras vigentes (sin anuladas)"],
    generatedAt: new Date(),
    summary: [
      { label: "Total comprado", value: r.totalCents, type: "money" },
      { label: "Pagado", value: r.paidCents, type: "money" },
      { label: "Por pagar", value: r.balanceCents, type: "money" },
    ],
    tables: [
      {
        title: "Compras",
        columns: [
          { header: "N°", type: "int" },
          { header: "Fecha", type: "date" },
          { header: "Proveedor", type: "text" },
          { header: "Comprobante", type: "text" },
          { header: "Total", type: "money" },
          { header: "Pagado", type: "money" },
          { header: "Saldo", type: "money" },
          { header: "Estado", type: "text" },
        ],
        rows: r.purchases.map((p) => [
          p.number,
          p.date,
          p.supplier?.name ?? "",
          `${DOC_TYPE_LABEL[p.docType]} ${p.docNumber ?? ""}`.trim(),
          p.totalCents,
          p.paidCents,
          p.balanceCents,
          PAYMENT_STATUS_LABEL[p.paymentStatus],
        ]),
        totals: ["Total", null, null, null, r.totalCents, r.paidCents, r.balanceCents, null],
      },
      {
        title: "Por proveedor",
        columns: [
          { header: "Proveedor", type: "text" },
          { header: "Compras", type: "int" },
          { header: "Total", type: "money" },
          { header: "Saldo", type: "money" },
        ],
        rows: r.bySupplier.map((s) => [s.name, s.count, s.totalCents, s.balanceCents]),
        totals: ["Total", r.purchases.length, r.totalCents, r.balanceCents],
      },
      {
        title: "Por ítem",
        columns: [
          { header: "Ítem", type: "text" },
          { header: "Cantidad (unidad base)", type: "text" },
          { header: "Total", type: "money" },
        ],
        rows: r.byItem.map((i) => [i.name, formatQuantity(i.quantity), i.totalCents]),
        totals: ["Total", null, r.totalCents],
      },
    ],
  };
}

async function payablesExport(): Promise<ExportDocument> {
  const r = await getPayablesReport();
  const today = businessDate();
  return {
    report: "Cuentas por pagar",
    fileBase: fileBaseFor("cuentas-por-pagar", today),
    period: `Al ${formatPeriod(today, today)}`,
    filters: ["Compras vigentes con saldo"],
    generatedAt: new Date(),
    summary: [
      { label: "Total adeudado", value: r.totalCents, type: "money" },
      { label: "Vencido", value: r.overdueCents, type: "money" },
    ],
    tables: [
      {
        title: "Por proveedor",
        columns: [
          { header: "Proveedor", type: "text" },
          { header: "Compras", type: "int" },
          { header: "Vencido", type: "money" },
          { header: "Debe", type: "money" },
        ],
        rows: r.bySupplier.map((s) => [s.name, s.count, s.overdueCents, s.balanceCents]),
        totals: ["Total", r.rows.length, r.overdueCents, r.totalCents],
      },
      {
        title: "Compras con saldo",
        columns: [
          { header: "N°", type: "int" },
          { header: "Fecha", type: "date" },
          { header: "Proveedor", type: "text" },
          { header: "Vence", type: "date" },
          { header: "Total", type: "money" },
          { header: "Abonado", type: "money" },
          { header: "Saldo", type: "money" },
          { header: "Estado", type: "text" },
          { header: "Abonos", type: "text" },
        ],
        rows: r.rows.map((p) => [
          p.number,
          p.date,
          p.supplier?.name ?? "",
          p.dueDate ?? "",
          p.totalCents,
          p.paidCents,
          p.balanceCents,
          `${PAYMENT_STATUS_LABEL[p.paymentStatus]}${p.overdue ? " (vencida)" : ""}`,
          p.payments
            .filter((x) => !x.voidedAt)
            .map((x) => `${x.date} ${SUPPLIER_METHOD_LABEL[x.method]} ${formatMoneyText(x.amountCents)}`)
            .join(" | "),
        ]),
        totals: ["Total", null, null, null, null, null, r.totalCents, null, null],
      },
    ],
  };
}

/** "Bebidas Frías" → "bebidas-frias" (para el nombre del archivo). */
export function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Reportes exportables. La clave es la que va en la URL: /api/exportar/<clave>. */
export const reportExports: Record<string, (params: ReportParams) => Promise<ExportDocument>> = {
  "ventas-por-canal": salesByChannelExport,
  "productos-vendidos": productsExport,
  anulaciones: voidsExport,
  "cuentas-por-cobrar": receivablesExport,
  stock: (p) => stockExport(p, false),
  "stock-bajo": (p) => stockExport(p, true),
  kardex: kardexExport,
  mermas: adjustmentsExport,
  compras: purchasesExport,
  "cuentas-por-pagar": () => payablesExport(),
};
