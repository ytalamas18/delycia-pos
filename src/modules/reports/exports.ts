import { fileBaseFor, formatPeriod, type ExportDocument } from "@/core/export";
import { paymentMethodLabel } from "@/modules/sales";

import { parseRange } from "./domain/range";
import { getProductsSold, getSalesByChannel, listCategoriesForFilter } from "./services/reports";

/** Parámetros de la URL: los mismos que usa la pantalla de Reportes. */
export type ReportParams = { desde?: string; hasta?: string; cat?: string; orden?: string; [key: string]: string | undefined };

export const channelName = (c: string) => (paymentMethodLabel as Record<string, string>)[c] ?? c;

async function salesByChannelExport(params: ReportParams): Promise<ExportDocument> {
  const range = parseRange(params);
  const r = await getSalesByChannel(range);
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
};
