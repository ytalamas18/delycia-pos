import { fileBaseFor, formatPeriod, type ExportDocument } from "@/core/export";
import { formatMoney as formatMoneyText } from "@/core/money";

import { channelName } from "./domain/labels";
import { parseCreditStatus } from "./domain/receivables";
import { parseRange } from "./domain/range";
import { getMoneyIn, getProductsSold, getReceivables, getSalesByChannel, getVoids, listCategoriesForFilter } from "./services/reports";

/** Parámetros de la URL: los mismos que usa la pantalla de Reportes. */
export type ReportParams = {
  desde?: string;
  hasta?: string;
  cat?: string;
  orden?: string;
  estado?: string;
  cliente?: string;
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
};
