import Link from "next/link";

import { ExportButtons } from "@/components/shell/export-buttons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/core/money";
import { cn } from "@/lib/utils";
import { paymentMethodLabel } from "@/modules/sales";

import type { ProductSort } from "../domain/products";
import { parseRange, type DateRange } from "../domain/range";
import type { Cell } from "../domain/sales";
import { getProductsSold, getSalesByChannel, listCategoriesForFilter } from "../services/reports";
import { DailyBars } from "./daily-bars";
import { RangeFilter } from "./range-filter";

type Params = { desde?: string; hasta?: string; vista?: string; cat?: string; orden?: string };

const channelName = (c: string) => (paymentMethodLabel as Record<string, string>)[c] ?? c;
const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;

export async function ReportsScreen({ params }: { params: Params }) {
  const range = parseRange(params);
  const view = params.vista === "productos" ? "productos" : "canales";
  const tabHref = (vista: string) => `/reportes?${new URLSearchParams({ vista, desde: range.from, hasta: range.to })}`;
  const keep: Record<string, string> = { vista: view };
  if (view === "productos" && params.cat) keep.cat = params.cat;
  if (view === "productos" && params.orden) keep.orden = params.orden;

  return (
    <div className="max-w-6xl space-y-4">
      <h1 className="text-2xl font-bold">Reportes</h1>
      <div className="flex gap-2" role="tablist">
        {[
          { key: "canales", label: "Ventas por canal" },
          { key: "productos", label: "Productos vendidos" },
        ].map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            role="tab"
            aria-selected={view === t.key}
            className={cn(
              "flex h-11 items-center rounded-lg px-4 font-semibold",
              view === t.key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <RangeFilter range={range} keep={keep} />
      <ExportButtons
        report={view === "productos" ? "productos-vendidos" : "ventas-por-canal"}
        params={{ ...keep, desde: range.from, hasta: range.to }}
      />
      <p className="text-sm text-muted-foreground">
        {range.from === range.to ? shortDate(range.from) : `Del ${shortDate(range.from)} al ${shortDate(range.to)}`} · días según
        la hora de La Paz · solo órdenes cobradas; las anuladas van aparte y no suman.
      </p>
      {view === "canales" ? (
        <SalesByChannel range={range} />
      ) : (
        <ProductsSold range={range} categoryId={params.cat ?? null} sort={params.orden === "monto" ? "monto" : "cantidad"} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A: ventas por canal (medio de pago)
// ---------------------------------------------------------------------------

async function SalesByChannel({ range }: { range: DateRange }) {
  const report = await getSalesByChannel(range);
  const { totals, channels } = report;
  // Canales sin ventas en el período no ocupan columna (menos ruido); el total no cambia.
  const shown = channels.filter((c) => totals.byChannel[c].orders > 0);
  const days = report.days.filter((d) => d.total.orders > 0 || d.cancelled.orders > 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Total vendido" value={formatMoney(totals.total.totalCents)} />
        <Stat label="Órdenes cobradas" value={String(totals.total.orders)} />
        <Stat label="Ticket promedio" value={formatMoney(totals.total.averageCents)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Por canal</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-md text-left">
            <thead className="text-sm text-muted-foreground">
              <tr className="border-b">
                <th className="py-2">Canal</th>
                <th className="py-2 text-right">Órdenes</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 text-right">Ticket prom.</th>
                <th className="py-2 text-right">% del total</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {shown.map((c) => (
                <tr key={c}>
                  <td className="py-2 font-medium">{channelName(c)}</td>
                  <CellCols cell={totals.byChannel[c]} />
                  <td className="py-2 text-right text-muted-foreground">
                    {totals.total.totalCents ? Math.round((totals.byChannel[c].totalCents / totals.total.totalCents) * 100) : 0} %
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    No hay ventas cobradas en este período.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 font-bold tabular-nums">
              <tr>
                <td className="py-2">Total del período</td>
                <CellCols cell={totals.total} />
                <td />
              </tr>
            </tfoot>
          </table>
          <p className="mt-2 text-sm text-muted-foreground">
            Una orden pagada con dos medios cuenta en los dos canales, pero una sola vez en el total.
          </p>
          <Cancelled orders={totals.cancelled.orders} totalCents={totals.cancelled.totalCents} />
        </CardContent>
      </Card>

      {report.days.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Total vendido por día</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyBars bars={report.days.map((d) => ({ day: d.day, totalCents: d.total.totalCents, orders: d.total.orders }))} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Por día y canal</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-2 pr-3">Día</th>
                {shown.map((c) => (
                  <th key={c} className="py-2 pr-3 text-right">
                    {channelName(c)}
                  </th>
                ))}
                <th className="py-2 pr-3 text-right">Total</th>
                <th className="py-2 text-right">Anuladas</th>
              </tr>
            </thead>
            <tbody className="divide-y tabular-nums">
              {days.map((d) => (
                <tr key={d.day}>
                  <td className="py-2 pr-3 font-medium whitespace-nowrap">{shortDate(d.day)}</td>
                  {shown.map((c) => (
                    <DayCell key={c} cell={d.byChannel[c]} />
                  ))}
                  <DayCell cell={d.total} strong />
                  <td className="py-2 text-right whitespace-nowrap text-red-700 dark:text-red-400">
                    {d.cancelled.orders > 0 ? `${d.cancelled.orders} · ${formatMoney(d.cancelled.totalCents)}` : "—"}
                  </td>
                </tr>
              ))}
              {days.length === 0 && (
                <tr>
                  <td colSpan={shown.length + 3} className="py-6 text-center text-muted-foreground">
                    Sin movimiento en este período.
                  </td>
                </tr>
              )}
            </tbody>
            {days.length > 0 && (
              <tfoot className="border-t-2 font-bold tabular-nums">
                <tr>
                  <td className="py-2 pr-3">Total</td>
                  {shown.map((c) => (
                    <DayCell key={c} cell={totals.byChannel[c]} />
                  ))}
                  <DayCell cell={totals.total} strong />
                  <td className="py-2 text-right whitespace-nowrap text-red-700 dark:text-red-400">
                    {totals.cancelled.orders > 0 ? `${totals.cancelled.orders} · ${formatMoney(totals.cancelled.totalCents)}` : "—"}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
          <p className="mt-2 text-xs text-muted-foreground">Cada celda: total · órdenes · ticket promedio.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function CellCols({ cell }: { cell: Cell }) {
  return (
    <>
      <td className="py-2 text-right">{cell.orders}</td>
      <td className="py-2 text-right">{formatMoney(cell.totalCents)}</td>
      <td className="py-2 text-right">{formatMoney(cell.averageCents)}</td>
    </>
  );
}

function DayCell({ cell, strong }: { cell: Cell; strong?: boolean }) {
  if (cell.orders === 0) return <td className="py-2 pr-3 text-right text-muted-foreground">—</td>;
  return (
    <td className="py-2 pr-3 text-right whitespace-nowrap">
      <div className={strong ? "font-bold" : "font-medium"}>{formatMoney(cell.totalCents)}</div>
      <div className="text-xs font-normal text-muted-foreground">
        {cell.orders} órd · {formatMoney(cell.averageCents)}
      </div>
    </td>
  );
}

// ---------------------------------------------------------------------------
// B: productos vendidos
// ---------------------------------------------------------------------------

async function ProductsSold({ range, categoryId, sort }: { range: DateRange; categoryId: string | null; sort: ProductSort }) {
  const [report, categories] = await Promise.all([
    getProductsSold(range, { categoryId, sort }),
    listCategoriesForFilter(),
  ]);
  const base = { vista: "productos", desde: range.from, hasta: range.to };
  const href = (extra: Record<string, string | null>) => {
    const next: Record<string, string> = { ...base };
    if (categoryId) next.cat = categoryId;
    if (sort === "monto") next.orden = "monto";
    for (const [k, v] of Object.entries(extra)) {
      if (v === null) delete next[k];
      else next[k] = v;
    }
    return `/reportes?${new URLSearchParams(next)}`;
  };
  const pill = (active: boolean) =>
    cn("rounded-full border px-3 py-1.5 text-sm font-medium", active ? "border-primary bg-primary text-primary-foreground" : "bg-card");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 text-sm font-medium text-muted-foreground">Categoría</span>
        <Link href={href({ cat: null })} className={pill(!categoryId)}>
          Todas
        </Link>
        {categories.map((c) => (
          <Link key={c.id} href={href({ cat: c.id })} className={pill(categoryId === c.id)}>
            {c.name}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 text-sm font-medium text-muted-foreground">Ordenar</span>
        <Link href={href({ orden: null })} className={pill(sort === "cantidad")}>
          Por cantidad
        </Link>
        <Link href={href({ orden: "monto" })} className={pill(sort === "monto")}>
          Por monto
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Ítems vendidos" value={String(report.totals.quantity)} />
        <Stat label="Total (antes de descuentos)" value={formatMoney(report.totals.totalCents)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Productos vendidos</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <ProductTable rows={report.products} totals={report.totals} empty="No se vendió nada en este período." />
          <p className="mt-2 text-sm text-muted-foreground">
            Montos con el precio cobrado en cada orden (incluye recargo PEYA y modificadores), antes del descuento de la
            orden. La categoría es la actual del producto.
          </p>
        </CardContent>
      </Card>

      {report.voided.products.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-red-700 dark:text-red-400">Anulados (no suman)</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <ProductTable rows={report.voided.products} totals={report.voided} empty="" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ProductTable({
  rows,
  totals,
  empty,
}: {
  rows: { productId: string; name: string; category: string | null; quantity: number; totalCents: number }[];
  totals: { quantity: number; totalCents: number };
  empty: string;
}) {
  return (
    <table className="w-full min-w-md text-left">
      <thead className="text-sm text-muted-foreground">
        <tr className="border-b">
          <th className="py-2">Producto</th>
          <th className="py-2">Categoría</th>
          <th className="py-2 text-right">Cant.</th>
          <th className="py-2 text-right">Total</th>
        </tr>
      </thead>
      <tbody className="divide-y tabular-nums">
        {rows.map((r) => (
          <tr key={r.productId}>
            <td className="py-2 font-medium">{r.name}</td>
            <td className="py-2 text-sm text-muted-foreground">{r.category ?? "Sin categoría"}</td>
            <td className="py-2 text-right">{r.quantity}</td>
            <td className="py-2 text-right">{formatMoney(r.totalCents)}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={4} className="py-6 text-center text-muted-foreground">
              {empty}
            </td>
          </tr>
        )}
      </tbody>
      <tfoot className="border-t-2 font-bold tabular-nums">
        <tr>
          <td className="py-2" colSpan={2}>
            Total
          </td>
          <td className="py-2 text-right">{totals.quantity}</td>
          <td className="py-2 text-right">{formatMoney(totals.totalCents)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function Cancelled({ orders, totalCents }: { orders: number; totalCents: number }) {
  if (orders === 0) return null;
  return (
    <p className="mt-3 rounded-lg border border-red-600/40 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
      Anuladas en el período: {orders} órdenes · {formatMoney(totalCents)} (no suman)
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
