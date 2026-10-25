"use client";

import { useActionState, useRef } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionResult, type ActionResult } from "@/core/actions/types";

import { addSupplierPaymentAction } from "../actions";
import { SUPPLIER_METHOD_LABEL } from "../domain/labels";

const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-base";

/** Abono a una compra (fecha, monto y método). */
export function PaymentForm({ purchaseId, today, balance }: { purchaseId: string; today: string; balance: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await addSupplierPaymentAction(prev, fd);
    if (r.ok) ref.current?.reset();
    return r;
  }, initialActionResult);
  return (
    <form ref={ref} action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="purchaseId" value={purchaseId} />
      <div className="grid gap-1">
        <Label htmlFor="pay-date">Fecha</Label>
        <Input id="pay-date" name="date" type="date" defaultValue={today} className="w-44" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="pay-amount">Monto (Bs)</Label>
        <Input id="pay-amount" name="amount" inputMode="decimal" placeholder={balance} className="w-36" />
        <FieldError state={state} name="amountCents" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="pay-method">Método</Label>
        <select id="pay-method" name="method" className={`${selectClass} w-52`} defaultValue="CASH">
          {Object.entries(SUPPLIER_METHOD_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <div className="grid min-w-48 flex-1 gap-1">
        <Label htmlFor="pay-note">Nota</Label>
        <Input id="pay-note" name="note" placeholder="Opcional" />
      </div>
      <Button type="submit" disabled={pending}>
        Registrar abono
      </Button>
      <FormStatus state={state} className="w-full" />
    </form>
  );
}
