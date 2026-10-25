import Link from "next/link";

import { Button } from "@/components/ui/button";
import { appConfig } from "@/core/config/app";
import { formatDay } from "@/core/export";
import { formatMoney } from "@/core/money";
import { formatQuantity } from "@/core/quantity";
import { cn } from "@/lib/utils";
import { formatCost, formatUnitCost, ITEM_TYPE_LABEL, ITEM_TYPES, UNIT_SHORT } from "@/modules/catalog";
import { MOVEMENT_LABEL, STOCK_LEVEL_LABEL } from "@/modules/inventory";
import { PAYMENT_STATUS_LABEL, SUPPLIER_METHOD_LABEL } from "@/modules/purchases";

import type { DateRange } from "../domain/range";
import { listCategoriesForFilter } from "../services/reports";
import { getAdjustmentsReport, getKardexReport, getPayablesReport, getPurchasesReport, getStockReport } from "../services/stock-purchases";
import { Stat } from "./stat";

const dateTime = new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short", timeZone: appConfig.timezone });
const th = "p-2 font-medium";
const pill = (active: boolean) =>
  cn("rounded-full border px-3 py-1.5 text-sm font-medium", active ? "border-primary bg-primary text-primary-foreground" : "bg-card");

function Table({ head, children, minWidth = "min-w-2xl" }: { head: React.ReactNode; children: React.ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className={cn("w-full text-sm", minWidth)}>
        <thead className="bg-muted/50 text-left text-muted-foreground">{head}</thead>
        {children}
      </table>
    </div>
  );
}

// --- Inventario: stock actual / stock bajo ---

export async function StockReportView({ type, categoryId, onlyAlerts }: { type: string | null; categoryId: string | null; onlyAlerts: boolean }) {
  const [r, categories] = await Promise.all([getStockReport({ type, categoryId, onlyAlerts }), listCategoriesForFilter()]);
  const vista = onlyAlerts ? "stock-bajo" : "stock";
  const href = (extra: Record<string, string | null>) => {
    const p: Record<string, string> = { vista };
    if (type) p.tipo = type;
    if (categoryId) p.cat = categoryId;
    for (const [k, v] of Object.entries(extra)) {
      if (v === null) delete p[k];
      else p[k] = v;
    }
    return `/reportes?${new URLSearchParams(p)}`;
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-20 text-sm font-medium text-muted-foreground">Tipo</span>
        <Link href={href({ tipo: null })} className={pill(!type)}>
          Todos
        </Link>
        {ITEM_TYPES.filter((t) => t !== "PREPARED").map((t) => (
          <Link key={t} href={href({ tipo: t })} className={pill(type === t)}>
            {ITEM_TYPE_LABEL[t]}
          </Link>
        ))}
      </div>
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
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Ítems" value={String(r.items.length)} />
        <Stat label="Valor del inventario" value={formatCost(r.totalValueCents)} />
        <Stat label="En negativo" value={String(r.items.filter((i) => i.level === "negative").length)} tone="danger" />
      </div>
      <Table
        head={
          <tr>
            <th className={th}>Ítem</th>
            <th className={th}>Tipo</th>
            <th className={th}>Categoría</th>
            <th className={`${th} text-right`}>Cantidad</th>
            <th className={`${th} text-right`}>Mínimo</th>
            <th className={`${th} text-right`}>Costo unit.</th>
            <th className={`${th} text-right`}>Valor</th>
            <th className={th}>Estado</th>
          </tr>
        }
      >
        <tbody className="divide-y">
          {r.items.map((i) => (
            <tr key={i.id} className={cn(i.level === "negative" && "bg-red-50 dark:bg-red-950/40", i.level === "low" && "bg-yellow-50 dark:bg-yellow-950/30")}>
              <td className="p-2 font-medium">{i.name}</td>
              <td className="p-2">{ITEM_TYPE_LABEL[i.type]}</td>
              <td className="p-2">{i.category.name}</td>
              <td className="p-2 text-right tabular-nums">
                {formatQuantity(i.stock)} {UNIT_SHORT[i.baseUnit]}
              </td>
              <td className="p-2 text-right tabular-nums">{i.minStock ? formatQuantity(i.minStock) : "—"}</td>
              <td className="p-2 text-right tabular-nums">{i.lastCostCents ? formatUnitCost(i.lastCostCents) : "—"}</td>
              <td className="p-2 text-right tabular-nums">{i.valueCents ? formatCost(i.valueCents) : "—"}</td>
              <td className="p-2">{i.level === "ok" ? "" : STOCK_LEVEL_LABEL[i.level]}</td>
            </tr>
          ))}
          {r.items.length === 0 && (
            <tr>
              <td colSpan={8} className="p-6 text-center text-muted-foreground">
                {onlyAlerts ? "Ningún ítem bajo el mínimo ni en negativo 👌" : "No hay ítems con stock con estos filtros."}
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}

// --- Inventario: kárdex ---

export async function KardexReportView({ productId, range }: { productId: string | null; range: DateRange }) {
  const r = await getKardexReport(productId, range);
  return (
    <div className="space-y-4">
      <form action="/reportes" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="vista" value="kardex" />
        <input type="hidden" name="desde" value={range.from} />
        <input type="hidden" name="hasta" value={range.to} />
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">Ítem</span>
          <select name="item" defaultValue={productId ?? ""} className="h-11 min-w-64 rounded-md border bg-background px-3 text-base">
            <option value="">Elegir…</option>
            {r.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Ver
        </Button>
      </form>
      {r.item && (
        <Table
          head={
            <tr>
              <th className={th}>Fecha</th>
              <th className={th}>Movimiento</th>
              <th className={th}>Nota</th>
              <th className={`${th} text-right`}>Cantidad</th>
              <th className={`${th} text-right`}>Saldo</th>
            </tr>
          }
        >
          <tbody className="divide-y">
            <tr className="bg-muted/30">
              <td className="p-2" colSpan={4}>
                Saldo al inicio del período
              </td>
              <td className="p-2 text-right font-semibold tabular-nums">
                {formatQuantity(r.opening)} {UNIT_SHORT[r.item.baseUnit]}
              </td>
            </tr>
            {r.rows.map((m) => (
              <tr key={m.id}>
                <td className="p-2 whitespace-nowrap">{dateTime.format(m.at)}</td>
                <td className="p-2">{MOVEMENT_LABEL[m.type]}</td>
                <td className="p-2 text-muted-foreground">{m.note ?? ""}</td>
                <td className={cn("p-2 text-right tabular-nums", m.quantity.isNegative() ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400")}>
                  {m.quantity.isPositive() ? "+" : ""}
                  {formatQuantity(m.quantity)}
                </td>
                <td className={cn("p-2 text-right font-semibold tabular-nums", m.balance.isNegative() && "text-red-700 dark:text-red-400")}>
                  {formatQuantity(m.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

// --- Inventario: mermas y ajustes ---

export async function AdjustmentsReportView({ range }: { range: DateRange }) {
  const r = await getAdjustmentsReport(range);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Ajustes" value={String(r.rows.length)} />
        <Stat label="Valor perdido (mermas)" value={formatCost(r.lostCents)} tone="danger" />
        <Stat label="Sobrantes" value={formatCost(r.surplusCents)} />
      </div>
      <Table
        head={
          <tr>
            <th className={th}>Fecha</th>
            <th className={th}>Ítem</th>
            <th className={`${th} text-right`}>Sistema</th>
            <th className={`${th} text-right`}>Contado</th>
            <th className={`${th} text-right`}>Diferencia</th>
            <th className={`${th} text-right`}>Valor</th>
            <th className={th}>Motivo</th>
          </tr>
        }
      >
        <tbody className="divide-y">
          {r.rows.map((a, i) => (
            <tr key={i}>
              <td className="p-2 whitespace-nowrap">{formatDay(a.date)}</td>
              <td className="p-2 font-medium">{a.productName}</td>
              <td className="p-2 text-right tabular-nums">{formatQuantity(a.expected)}</td>
              <td className="p-2 text-right tabular-nums">{formatQuantity(a.counted)}</td>
              <td className={cn("p-2 text-right font-semibold tabular-nums", a.difference.isNegative() ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400")}>
                {a.difference.isPositive() ? "+" : ""}
                {formatQuantity(a.difference)}
              </td>
              <td className="p-2 text-right tabular-nums">{a.valueCents ? formatCost(a.valueCents) : "—"}</td>
              <td className="p-2 text-muted-foreground">{a.reason ?? ""}</td>
            </tr>
          ))}
          {r.rows.length === 0 && (
            <tr>
              <td colSpan={7} className="p-6 text-center text-muted-foreground">
                No hubo diferencias de conteo en este período.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}

// --- Compras ---

export async function PurchasesReportView({ range }: { range: DateRange }) {
  const r = await getPurchasesReport(range);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Compras (gasto del período)" value={formatMoney(r.totalCents)} />
        <Stat label="Pagado" value={formatMoney(r.paidCents)} />
        <Stat label="Por pagar" value={formatMoney(r.balanceCents)} tone={r.balanceCents > 0 ? "danger" : undefined} />
      </div>
      <h2 className="text-lg font-semibold">Por proveedor</h2>
      <Table
        minWidth="min-w-md"
        head={
          <tr>
            <th className={th}>Proveedor</th>
            <th className={`${th} text-right`}>Compras</th>
            <th className={`${th} text-right`}>Total</th>
            <th className={`${th} text-right`}>Saldo</th>
          </tr>
        }
      >
        <tbody className="divide-y">
          {r.bySupplier.map((s) => (
            <tr key={s.name}>
              <td className="p-2 font-medium">{s.name}</td>
              <td className="p-2 text-right">{s.count}</td>
              <td className="p-2 text-right tabular-nums">{formatMoney(s.totalCents)}</td>
              <td className="p-2 text-right tabular-nums">{formatMoney(s.balanceCents)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      <h2 className="text-lg font-semibold">Por ítem</h2>
      <Table
        minWidth="min-w-md"
        head={
          <tr>
            <th className={th}>Ítem</th>
            <th className={`${th} text-right`}>Cantidad (unidad base)</th>
            <th className={`${th} text-right`}>Total</th>
          </tr>
        }
      >
        <tbody className="divide-y">
          {r.byItem.map((i) => (
            <tr key={i.name}>
              <td className="p-2 font-medium">{i.name}</td>
              <td className="p-2 text-right tabular-nums">{formatQuantity(i.quantity)}</td>
              <td className="p-2 text-right tabular-nums">{formatMoney(i.totalCents)}</td>
            </tr>
          ))}
          {r.byItem.length === 0 && (
            <tr>
              <td colSpan={3} className="p-6 text-center text-muted-foreground">
                Sin compras en este período.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}

export async function PayablesReportView() {
  const r = await getPayablesReport();
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Total adeudado" value={formatMoney(r.totalCents)} tone={r.totalCents > 0 ? "danger" : undefined} />
        <Stat label="Vencido" value={formatMoney(r.overdueCents)} tone={r.overdueCents > 0 ? "danger" : undefined} />
      </div>
      <h2 className="text-lg font-semibold">Por proveedor</h2>
      <Table
        minWidth="min-w-md"
        head={
          <tr>
            <th className={th}>Proveedor</th>
            <th className={`${th} text-right`}>Compras</th>
            <th className={`${th} text-right`}>Vencido</th>
            <th className={`${th} text-right`}>Debe</th>
          </tr>
        }
      >
        <tbody className="divide-y">
          {r.bySupplier.map((s) => (
            <tr key={s.name}>
              <td className="p-2 font-medium">{s.name}</td>
              <td className="p-2 text-right">{s.count}</td>
              <td className={cn("p-2 text-right tabular-nums", s.overdueCents > 0 && "font-semibold text-red-700 dark:text-red-400")}>
                {formatMoney(s.overdueCents)}
              </td>
              <td className="p-2 text-right font-semibold tabular-nums">{formatMoney(s.balanceCents)}</td>
            </tr>
          ))}
          {r.rows.length === 0 && (
            <tr>
              <td colSpan={4} className="p-6 text-center text-muted-foreground">
                No hay cuentas por pagar 👌
              </td>
            </tr>
          )}
        </tbody>
      </Table>
      <h2 className="text-lg font-semibold">Compras con saldo</h2>
      <div className="space-y-3">
        {r.rows.map((p) => (
          <div key={p.id} className={cn("rounded-lg border p-3 text-sm", p.overdue && "border-red-500 bg-red-50 dark:bg-red-950/40")}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Link href={`/compras/${p.id}`} className="font-semibold underline-offset-2 hover:underline">
                Compra #{p.number}
              </Link>
              <span>{p.supplier?.name ?? "Sin proveedor"}</span>
              <span>{formatDay(p.date)}</span>
              <span>Vence: {p.dueDate ? formatDay(p.dueDate) : "—"}</span>
              <span className="ml-auto tabular-nums">
                Total {formatMoney(p.totalCents)} · abonado {formatMoney(p.paidCents)} ·{" "}
                <strong>saldo {formatMoney(p.balanceCents)}</strong> · {PAYMENT_STATUS_LABEL[p.paymentStatus]}
                {p.overdue && <strong className="text-red-700 dark:text-red-400"> · VENCIDA</strong>}
              </span>
            </div>
            {p.payments.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-muted-foreground">
                {p.payments.map((x) => (
                  <li key={x.id} className={cn(x.voidedAt && "line-through")}>
                    {formatDay(x.date)} · {SUPPLIER_METHOD_LABEL[x.method]} · {formatMoney(x.amountCents)}
                    {x.voidedAt && ` (anulado: ${x.voidReason})`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
