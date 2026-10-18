import { fileBaseFor, formatPeriod, type ExportDocument } from "@/core/export";

import { channelLabel, orderLabel, orderStatusLabel, paymentMethodLabel, serviceTypeLabel } from "../domain/labels";
import { listOrdersForDay, parseHistoryFilters, type HistoryParams } from "../services/history";

/** Historial de un día con los MISMOS filtros que la pantalla. */
export async function buildHistoryExport(date: string, params: HistoryParams): Promise<ExportDocument> {
  const filters = parseHistoryFilters(params);
  const orders = (await listOrdersForDay(date, filters)).sort((a, b) => a.number - b.number);
  const isPaid = (status: string) => status === "PAID" || status === "CLOSED";
  const collected = orders.filter((o) => isPaid(o.status)).reduce((s, o) => s + o.totalCents, 0);

  const filterText = [
    filters.status && `Estado: ${orderStatusLabel[filters.status]}`,
    filters.serviceType && `Tipo: ${serviceTypeLabel[filters.serviceType]}`,
    filters.channel && `Canal: ${channelLabel[filters.channel]}`,
    filters.method && `Pago: ${paymentMethodLabel[filters.method]}`,
  ].filter((x): x is string => !!x);

  return {
    report: "Historial de órdenes",
    fileBase: fileBaseFor("historial", date),
    period: formatPeriod(date, date),
    filters: filterText.length ? filterText : ["Sin filtros"],
    generatedAt: new Date(),
    summary: [
      { label: "Órdenes", value: orders.length, type: "int" },
      { label: "Cobrado", value: collected, type: "money" },
      { label: "Anuladas", value: orders.filter((o) => o.status === "CANCELLED").length, type: "int" },
    ],
    tables: [
      {
        title: "Órdenes",
        columns: [
          { header: "N°", type: "int" },
          { header: "Abierta", type: "datetime" },
          { header: "Orden", type: "text" },
          { header: "Tipo", type: "text" },
          { header: "Canal", type: "text" },
          { header: "Estado", type: "text" },
          { header: "Pago", type: "text" },
          { header: "Productos", type: "text" },
          { header: "Total", type: "money" },
          { header: "Cobrado", type: "money" },
          { header: "Motivo anulación", type: "text" },
        ],
        rows: orders.map((o) => {
          const live = o.payments.filter((p) => !p.refundedAt);
          const methods = [...new Set((live.length ? live : o.payments).map((p) => paymentMethodLabel[p.method]))].join(" + ");
          return [
            o.number,
            o.openedAt,
            orderLabel(o),
            serviceTypeLabel[o.serviceType],
            channelLabel[o.channel],
            orderStatusLabel[o.status],
            live.length || !methods ? methods : `${methods} (devuelto)`,
            o.items
              .filter((i) => i.status === "ACTIVE")
              .map((i) => `${i.quantity}× ${i.productName}`)
              .join(", "),
            o.totalCents,
            isPaid(o.status) ? o.totalCents : 0,
            o.cancelReason ?? "",
          ];
        }),
        totals: ["Total", null, null, null, null, null, null, null, null, collected, null],
        notes: ["\"Cobrado\" solo suma órdenes pagadas o cerradas; las anuladas y las por pagar quedan en 0."],
      },
    ],
  };
}
