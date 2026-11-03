"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionResult, type ActionResult } from "@/core/actions/types";
import { formatMoney, formatMoneyInput, parseMoney } from "@/core/money";

import { createDepositAction } from "../actions";

export type PendingRelief = { id: string; date: string; time: string; amountCents: number; carriedByName: string | null; note: string | null };

function cents(text: string): number | null {
  try {
    return text.trim() ? parseMoney(text) : null;
  } catch {
    return null;
  }
}

const day = (d: string) => d.split("-").reverse().join("/");

/**
 * Alivios pendientes de depositar + registrar el depósito: se marcan los alivios que cubre y lo que llegó al
 * banco. Si no coincide, pide el motivo de la diferencia.
 */
export function DepositForm({ pending, today, canManage }: { pending: PendingRelief[]; today: string; canManage: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState("");
  const [formKey, setFormKey] = useState(0);
  const [state, action, busy] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await createDepositAction(prev, fd);
    if (r.ok) {
      setSelected(new Set());
      setAmount("");
      setFormKey((k) => k + 1);
    }
    return r;
  }, initialActionResult);

  const total = pending.reduce((s, r) => s + r.amountCents, 0);
  const selectedCents = pending.filter((r) => selected.has(r.id)).reduce((s, r) => s + r.amountCents, 0);
  const arrived = amount.trim() ? cents(amount) : selected.size ? selectedCents : null;
  const diff = arrived !== null && selected.size ? arrived - selectedCents : 0;
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (pending.length === 0) {
    return (
      <>
        <p className="text-sm text-muted-foreground">No hay alivios pendientes de depositar.</p>
        {state.ok && state.message && <FormStatus state={state} />}
      </>
    );
  }

  return (
    <form key={formKey} action={action} className="space-y-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-xl text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              {canManage && <th className="w-10 p-2" />}
              <th className="p-2 font-medium">Fecha</th>
              <th className="p-2 font-medium">Lleva</th>
              <th className="p-2 font-medium">Nota</th>
              <th className="p-2 text-right font-medium">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y tabular-nums">
            {pending.map((r) => (
              <tr key={r.id} className={selected.has(r.id) ? "bg-primary/5" : ""}>
                {canManage && (
                  <td className="p-2">
                    <input
                      type="checkbox"
                      name="withdrawalId"
                      value={r.id}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      aria-label={`Alivio del ${day(r.date)} ${r.time}`}
                      className="size-5"
                    />
                  </td>
                )}
                <td className="p-2 whitespace-nowrap">
                  {day(r.date)} <span className="text-xs text-muted-foreground">{r.time}</span>
                </td>
                <td className="p-2">{r.carriedByName ?? "—"}</td>
                <td className="p-2 text-muted-foreground">{r.note ?? ""}</td>
                <td className="p-2 text-right font-semibold">{formatMoney(r.amountCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 font-bold tabular-nums">
            <tr>
              <td className="p-2" colSpan={canManage ? 4 : 3}>
                Total pendiente de depositar
              </td>
              <td className="p-2 text-right">{formatMoney(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {canManage && (
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-semibold">Registrar depósito al banco</h3>
          <p className="text-sm text-muted-foreground">
            Marca arriba los alivios que depositaste. Seleccionado: <strong>{formatMoney(selectedCents)}</strong>
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1">
              <Label htmlFor="dep-date">Fecha del depósito</Label>
              <Input id="dep-date" name="date" type="date" defaultValue={today} max={today} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="dep-amount">Monto que llegó al banco (Bs)</Label>
              <Input
                id="dep-amount"
                inputMode="decimal"
                placeholder={selectedCents ? formatMoneyInput(selectedCents) : "Ej. 1500"}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="dep-ref">N° de comprobante</Label>
              <Input id="dep-ref" name="reference" maxLength={60} placeholder="Opcional" />
            </div>
            {diff !== 0 && (
              <div className="grid gap-1 sm:col-span-3">
                <Label htmlFor="dep-diff" className="text-red-700 dark:text-red-400">
                  {diff < 0 ? "Faltante" : "Sobrante"} de {formatMoney(Math.abs(diff))}: motivo (obligatorio)
                </Label>
                <Input id="dep-diff" name="differenceReason" maxLength={200} placeholder="Ej. faltó un billete, se usó para cambio" required />
              </div>
            )}
            <div className="grid gap-1 sm:col-span-3">
              <Label htmlFor="dep-note">Nota</Label>
              <Input id="dep-note" name="note" maxLength={200} placeholder="Opcional" />
            </div>
          </div>
          {/* Vacío = llegó exactamente lo seleccionado. */}
          <input type="hidden" name="amount" value={amount.trim() || (selectedCents > 0 ? formatMoneyInput(selectedCents) : "")} />
          <Button type="submit" disabled={busy || selected.size === 0}>
            {busy ? "Guardando…" : "Registrar depósito"}
          </Button>
          <FormStatus state={state} />
        </div>
      )}
    </form>
  );
}
