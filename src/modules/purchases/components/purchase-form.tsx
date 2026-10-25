"use client";

import { Plus, X } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/core/actions/types";
import { formatMoney, parseMoney } from "@/core/money";
import type { PurchaseDocType, SupplierPaymentMethod } from "@/generated/prisma/enums";

import { createPurchaseAction } from "../actions";
import { DOC_TYPE_LABEL, PAYMENT_MODE_LABEL, SUPPLIER_METHOD_LABEL, type PaymentMode } from "../domain/labels";

/** Ítem comprable ya preparado por el servidor (sin Decimal). */
export type PurchaseFormItem = {
  id: string;
  name: string;
  /** Unidad base corta ("kg"). */
  unit: string;
  addsStock: boolean;
  /** Opciones de "cómo se compró": presentaciones y unidades compatibles. `factor` = unidades base por 1. */
  options: { value: string; label: string; factor: number }[];
};

type Line = { key: number; productId: string; presentation: string; quantity: string; total: string };

const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-base";
const newLine = (key: number): Line => ({ key, productId: "", presentation: "", quantity: "", total: "" });

function cents(text: string): number | null {
  try {
    return parseMoney(text);
  } catch {
    return null;
  }
}

export function PurchaseForm({
  items,
  suppliers,
  today,
}: {
  items: PurchaseFormItem[];
  suppliers: { id: string; name: string }[];
  today: string;
}) {
  const [lines, setLines] = useState<Line[]>([newLine(1)]);
  const [mode, setMode] = useState<PaymentMode>("CASH_FULL");
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const byId = new Map(items.map((i) => [i.id, i]));

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + (cents(l.total) ?? 0), 0);

  function submit(fd: FormData) {
    start(async () => {
      const result = await createPurchaseAction({
        date: String(fd.get("date")),
        supplierId: String(fd.get("supplierId") ?? ""),
        docType: String(fd.get("docType")) as PurchaseDocType,
        docNumber: String(fd.get("docNumber") ?? ""),
        note: String(fd.get("note") ?? ""),
        dueDate: String(fd.get("dueDate") ?? ""),
        paymentMode: mode,
        paymentMethod: String(fd.get("paymentMethod") ?? "CASH") as SupplierPaymentMethod,
        paidNow: String(fd.get("paidNow") ?? ""),
        lines: lines
          .filter((l) => l.productId)
          .map((l) => ({ productId: l.productId, presentation: l.presentation, quantity: l.quantity, totalCents: l.total })),
      });
      setState(result);
    });
  }

  return (
    <form action={submit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1">
          <Label htmlFor="date">Fecha de compra</Label>
          <Input id="date" name="date" type="date" defaultValue={today} />
        </div>
        <div className="grid gap-1 lg:col-span-2">
          <Label htmlFor="supplierId">Proveedor {mode === "CASH_FULL" && <span className="text-muted-foreground">(opcional)</span>}</Label>
          <select id="supplierId" name="supplierId" className={selectClass} defaultValue="">
            <option value="">— Sin proveedor —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="docType">Comprobante</Label>
          <select id="docType" name="docType" className={selectClass} defaultValue="NONE">
            {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="docNumber">N° de comprobante</Label>
          <Input id="docNumber" name="docNumber" placeholder="Opcional" />
        </div>
        <div className="grid gap-1 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="note">Nota</Label>
          <Input id="note" name="note" placeholder="Opcional" />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Ítems</h2>
        {lines.map((l) => {
          const item = byId.get(l.productId);
          const option = item?.options.find((o) => o.value === l.presentation);
          const qty = Number(l.quantity.replace(",", "."));
          const lineCents = cents(l.total);
          const unitCost = option && qty > 0 && lineCents ? lineCents / (qty * option.factor) : null;
          return (
            <div key={l.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[2fr_1.4fr_1fr_1fr_auto] sm:items-start">
              <select
                aria-label="Ítem"
                value={l.productId}
                onChange={(e) => {
                  const it = byId.get(e.target.value);
                  update(l.key, { productId: e.target.value, presentation: it?.options[0]?.value ?? "" });
                }}
                className={selectClass}
              >
                <option value="">Elegir ítem…</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Cómo se compró"
                value={l.presentation}
                onChange={(e) => update(l.key, { presentation: e.target.value })}
                className={selectClass}
                disabled={!item}
              >
                {item?.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Input aria-label="Cantidad" inputMode="decimal" placeholder="Cantidad" value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
              <Input aria-label="Total de la línea (Bs)" inputMode="decimal" placeholder="Total Bs" value={l.total} onChange={(e) => update(l.key, { total: e.target.value })} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Quitar línea"
                onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [newLine(l.key + 1)]))}
              >
                <X />
              </Button>
              {item && (
                <p className="text-sm text-muted-foreground sm:col-span-5">
                  {option && qty > 0 && `= ${(qty * option.factor).toLocaleString("es-BO")} ${item.unit}`}
                  {unitCost !== null && ` · costo ${formatMoney(Math.round(unitCost))} / ${item.unit}`}
                  {item.addsStock ? " · suma al stock" : " · no maneja stock (solo gasto)"}
                </p>
              )}
            </div>
          );
        })}
        <Button type="button" variant="outline" onClick={() => setLines((ls) => [...ls, newLine(Math.max(...ls.map((x) => x.key)) + 1)])}>
          <Plus /> Agregar ítem
        </Button>
        <p className="text-right text-xl font-semibold">Total: {formatMoney(total)}</p>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Pago</h2>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PAYMENT_MODE_LABEL) as PaymentMode[]).map((m) => (
            <Button key={m} type="button" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>
              {PAYMENT_MODE_LABEL[m]}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {mode === "PARTIAL" && (
            <div className="grid gap-1">
              <Label htmlFor="paidNow">Pagado ahora (Bs)</Label>
              <Input id="paidNow" name="paidNow" inputMode="decimal" className="w-40" />
            </div>
          )}
          {mode !== "CREDIT" && (
            <div className="grid gap-1">
              <Label htmlFor="paymentMethod">Método</Label>
              <select id="paymentMethod" name="paymentMethod" className={`${selectClass} w-56`} defaultValue="CASH">
                {Object.entries(SUPPLIER_METHOD_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          )}
          {mode !== "CASH_FULL" && (
            <div className="grid gap-1">
              <Label htmlFor="dueDate">Vencimiento (opcional)</Label>
              <Input id="dueDate" name="dueDate" type="date" className="w-44" />
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          El gasto se registra por el total en la fecha de compra. Si se paga en efectivo, sale de la caja de ese día
          (aparece en el cierre como &quot;Pagos a proveedores&quot;).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Guardando…" : "Registrar compra"}
        </Button>
        {state && <FormStatus state={state} />}
      </div>
    </form>
  );
}
