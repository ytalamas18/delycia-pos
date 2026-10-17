import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { appConfig } from "@/core/config/app";
import { formatMoney } from "@/core/money";
import { cn } from "@/lib/utils";

import { channelLabel, orderLabel, orderStatusLabel, paymentMethodLabel } from "../domain/labels";
import { listOrdersForDay, type HistoryFilters } from "../services/history";
import { DayPicker } from "./day-picker";

const time = new Intl.DateTimeFormat("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: appConfig.timezone });

const statusStyle: Record<string, string> = {
  OPEN: "bg-yellow-300 text-black",
  PAID: "bg-blue-600 text-white",
  CLOSED: "bg-green-600 text-white",
  CANCELLED: "bg-red-600 text-white",
};

type FilterKey = "estado" | "tipo" | "canal" | "metodo";
const FILTERS: { key: FilterKey; label: string; options: { value: string; label: string }[] }[] = [
  {
    key: "estado",
    label: "Estado",
    options: (["OPEN", "PAID", "CLOSED", "CANCELLED"] as const).map((s) => ({ value: s, label: orderStatusLabel[s] })),
  },
  {
    key: "tipo",
    label: "Tipo",
    options: [
      { value: "DINE_IN", label: "Comer aquí" },
      { value: "TAKEAWAY", label: "Para llevar" },
    ],
  },
  { key: "canal", label: "Canal", options: (["LOCAL", "PEYA"] as const).map((c) => ({ value: c, label: channelLabel[c] })) },
  {
    key: "metodo",
    label: "Pago",
    options: (["CASH", "QR", "CARD", "PEYA", "CREDIT"] as const).map((m) => ({ value: m, label: paymentMethodLabel[m] })),
  },
];

export async function HistoryList({ date, params }: { date: string; params: Partial<Record<FilterKey, string>> }) {
  const filters: HistoryFilters = {
    status: params.estado as HistoryFilters["status"],
    serviceType: params.tipo as HistoryFilters["serviceType"],
    channel: params.canal as HistoryFilters["channel"],
    method: params.metodo as HistoryFilters["method"],
  };
  const orders = await listOrdersForDay(date, filters);
  const active = Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>;
  const total = orders.filter((o) => o.status === "PAID" || o.status === "CLOSED").reduce((s, o) => s + o.totalCents, 0);

  const toggleHref = (key: FilterKey, value: string) => {
    const next: Record<string, string> = { ...active, fecha: date };
    if (next[key] === value) delete next[key];
    else next[key] = value;
    return `/historial?${new URLSearchParams(next)}`;
  };

  return (
    <div className="space-y-4">
      <DayPicker basePath="/historial" date={date} query={Object.fromEntries(Object.entries(active).filter(([k]) => k !== "fecha"))} />

      <div className="space-y-2">
        {FILTERS.map((f) => (
          <div key={f.key} className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-sm font-medium text-muted-foreground">{f.label}</span>
            {f.options.map((o) => (
              <Link
                key={o.value}
                href={toggleHref(f.key, o.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium",
                  active[f.key] === o.value ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                )}
              >
                {o.label}
              </Link>
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground">{orders.length} órdenes</span>
        <span className="text-lg">
          Cobrado (filtro actual): <strong className="tabular-nums">{formatMoney(total)}</strong>
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left">
          <thead className="bg-muted text-sm text-muted-foreground">
            <tr>
              <th className="p-3">#</th>
              <th className="p-3">Hora</th>
              <th className="p-3">Orden</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Pago</th>
              <th className="p-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {orders.map((o) => (
              <tr key={o.id} className="hover:bg-accent">
                <td className="p-3 text-lg font-bold">
                  <Link href={`/historial/${o.id}`} className="block">
                    {o.number}
                  </Link>
                </td>
                <td className="p-3 tabular-nums">{time.format(o.openedAt)}</td>
                <td className="p-3">
                  <Link href={`/historial/${o.id}`} className="block font-medium">
                    {orderLabel(o)}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {o.items
                      .filter((i) => i.status === "ACTIVE")
                      .map((i) => `${i.quantity}× ${i.productName}`)
                      .join(", ")}
                  </span>
                </td>
                <td className="p-3">
                  <Badge className={statusStyle[o.status]}>{orderStatusLabel[o.status]}</Badge>
                </td>
                <td className="p-3 text-sm">
                  {[...new Set(o.payments.filter((p) => !p.refundedAt).map((p) => paymentMethodLabel[p.method]))].join(" + ") || "—"}
                </td>
                <td className="p-3 text-right text-lg font-semibold tabular-nums">{formatMoney(o.totalCents)}</td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No hay órdenes con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
