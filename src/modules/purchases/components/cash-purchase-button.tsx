"use client";

import { Plus, ShoppingCart, X } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import { initialActionResult, type ActionResult } from "@/core/actions/types";
import { appConfig } from "@/core/config/app";
import { formatMoney, parseMoney } from "@/core/money";

import { cashPurchaseDataAction, createCashPurchaseAction, voidCashPurchaseAction } from "../actions";
import { needsDetail } from "../domain/labels";
import type { CashPurchaseRow } from "../services/purchases";
import type { PurchaseFormItem } from "./purchase-form";

type Line = { key: number; productId: string; presentation: string; quantity: string; total: string; detail: string };
type Data = { items: PurchaseFormItem[]; suppliers: { id: string; name: string }[]; today: CashPurchaseRow[] };

const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-base";
const newLine = (key: number): Line => ({ key, productId: "", presentation: "", quantity: "1", total: "", detail: "" });
const time = new Intl.DateTimeFormat("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: appConfig.timezone });

function cents(text: string): number | null {
  try {
    return text.trim() ? parseMoney(text) : null;
  } catch {
    return null;
  }
}

/** Botón de la barra superior: compra o gasto pagado con efectivo de la caja (resta solo del cierre). */
export function CashPurchaseButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        aria-label="Compra en efectivo"
        onClick={() => setOpen(true)}
        className="border-violet-600 text-violet-700 dark:border-violet-400 dark:text-violet-300"
      >
        <ShoppingCart /> <span className="hidden sm:inline">Compra en efectivo</span>
      </Button>
      {open && <CashPurchaseDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function CashPurchaseDialog({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();
  const [lines, setLines] = useState<Line[]>([newLine(1)]);
  const [supplierId, setSupplierId] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const reload = () => startLoading(async () => setData(await cashPurchaseDataAction()));
  // Carga ítems, proveedores y las compras de hoy al abrir.
  useEffect(reload, []);

  const byId = new Map((data?.items ?? []).map((i) => [i.id, i]));
  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + (cents(l.total) ?? 0), 0);

  function save() {
    startSaving(async () => {
      const r = await createCashPurchaseAction({
        supplierId,
        docType: docNumber.trim() ? "RECEIPT" : "NONE",
        docNumber,
        note,
        lines: lines
          .filter((l) => l.productId)
          .map((l) => ({ productId: l.productId, presentation: l.presentation, quantity: l.quantity, totalCents: l.total, detail: l.detail })),
      });
      setResult(r);
      if (r.ok) {
        setLines([newLine(1)]);
        setSupplierId("");
        setDocNumber("");
        setNote("");
        reload();
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogTitle>Compra en efectivo</DialogTitle>
        <DialogDescription>
          Compra o gasto pagado con plata de la caja de hoy. Sale de la caja: resta del efectivo esperado en el cierre.
        </DialogDescription>
        {!data ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (
          <div className="space-y-3">
            {lines.map((l) => {
              const item = byId.get(l.productId);
              return (
                <div key={l.key} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-[2fr_1.3fr_0.8fr_1fr_auto]">
                  <SearchSelect
                    aria-label="Ítem"
                    value={l.productId}
                    onChange={(v) => update(l.key, { productId: v, presentation: byId.get(v)?.options[0]?.value ?? "" })}
                    options={(data.items ?? []).map((i) => ({ value: i.id, label: i.name, hint: i.unit }))}
                    placeholder="Buscar ítem…"
                  />
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
                  <Input aria-label="Cantidad" inputMode="decimal" placeholder="Cant." value={l.quantity} onChange={(e) => update(l.key, { quantity: e.target.value })} />
                  <Input aria-label="Total (Bs)" inputMode="decimal" placeholder="Total Bs" value={l.total} onChange={(e) => update(l.key, { total: e.target.value })} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Quitar línea"
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [newLine(l.key + 1)]))}
                  >
                    <X />
                  </Button>
                  {item && needsDetail(item.name) && (
                    <Input
                      aria-label="¿Qué se compró?"
                      className="sm:col-span-5"
                      value={l.detail}
                      maxLength={120}
                      placeholder="¿Qué se compró? (obligatorio) Ej. empanadas y refresco"
                      onChange={(e) => update(l.key, { detail: e.target.value })}
                    />
                  )}
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, newLine(Math.max(...ls.map((x) => x.key)) + 1)])}>
              <Plus /> Otro ítem
            </Button>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="cp-supplier">Proveedor (opcional)</Label>
                <select id="cp-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={selectClass}>
                  <option value="">Sin proveedor</option>
                  {data.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="cp-doc">N° de boleta / recibo</Label>
                <Input id="cp-doc" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} maxLength={40} placeholder="Opcional" />
              </div>
              <div className="grid gap-1 sm:col-span-2">
                <Label htmlFor="cp-note">Nota</Label>
                <Input id="cp-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Opcional (ej. pasaje del delivery)" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-lg">
                Sale de la caja: <strong className="tabular-nums">{formatMoney(total)}</strong>
              </span>
              <Button size="lg" onClick={save} disabled={saving || total <= 0}>
                {saving ? "Guardando…" : "Registrar compra"}
              </Button>
            </div>
            {result && <FormStatus state={result} />}
            <p className="text-xs text-muted-foreground">
              ¿Falta un ítem? Pídele a un Admin que lo cree en Catálogo (ej. en la categoría &quot;Gastos operativos&quot;).
            </p>
          </div>
        )}

        <div className="space-y-2 border-t pt-3">
          <h3 className="font-semibold">Compras en efectivo de hoy</h3>
          {!data || loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : data.today.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay compras en efectivo hoy.</p>
          ) : (
            <ul className="divide-y">
              {data.today.map((p) => (
                <TodayRow key={p.id} p={p} onVoided={reload} />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TodayRow({ p, onVoided }: { p: CashPurchaseRow; onVoided: () => void }) {
  const [voiding, setVoiding] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await voidCashPurchaseAction(prev, fd);
    if (r.ok) onVoided();
    return r;
  }, initialActionResult);
  const cancelled = p.status === "CANCELLED";
  return (
    <li className="space-y-1 py-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className={cancelled ? "text-muted-foreground line-through" : ""}>
          <span className="font-medium">
            {time.format(new Date(p.createdAt))} · Compra #{p.number}
          </span>{" "}
          · {p.items.join(", ")}
          {p.supplier && ` · ${p.supplier}`}
          <span className="block text-xs text-muted-foreground">Registró {p.byName ?? "—"}</span>
        </div>
        <span className={`font-semibold tabular-nums ${cancelled ? "text-muted-foreground line-through" : ""}`}>{formatMoney(p.totalCents)}</span>
      </div>
      {cancelled ? (
        <p className="text-xs text-red-700 dark:text-red-400">
          Anulada por {p.cancelledByName ?? "—"}: {p.cancelReason}
        </p>
      ) : voiding ? (
        <form action={formAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="id" value={p.id} />
          <Input name="reason" placeholder="Motivo de la anulación" aria-label="Motivo de la anulación" className="h-9 flex-1" autoFocus required />
          <Button type="submit" variant="destructive" size="sm" disabled={pending}>
            Anular
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setVoiding(false)}>
            Cancelar
          </Button>
          {!state.ok && <FormStatus state={state} className="w-full" />}
        </form>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => setVoiding(true)}>
          Anular compra
        </Button>
      )}
    </li>
  );
}
