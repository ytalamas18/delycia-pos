"use client";

import { useActionState, useRef } from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionResult, type ActionResult } from "@/core/actions/types";
import { MONEY_ACCOUNT_LABEL } from "@/core/money/accounts";
import type { MoneyAccount } from "@/generated/prisma/enums";

import { setOpeningBalanceAction } from "../actions";

const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-base";

/** Saldo inicial de una cuenta (una vez por cuenta). */
export function OpeningBalanceForm({ accounts, today }: { accounts: MoneyAccount[]; today: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await setOpeningBalanceAction(prev, fd);
    if (r.ok) ref.current?.reset();
    return r;
  }, initialActionResult);
  if (accounts.length === 0) return null;
  return (
    <form ref={ref} action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="grid gap-1">
          <Label htmlFor="ob-account">Cuenta</Label>
          <select id="ob-account" name="account" className={selectClass}>
            {accounts.map((a) => (
              <option key={a} value={a}>
                {MONEY_ACCOUNT_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="ob-date">Saldo al empezar el día</Label>
          <Input id="ob-date" name="date" type="date" defaultValue={today} max={today} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="ob-amount">Saldo (Bs)</Label>
          <Input id="ob-amount" name="amount" inputMode="decimal" placeholder="Ej. 1500" required />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="ob-note">Nota</Label>
          <Input id="ob-note" name="note" maxLength={200} placeholder="Opcional (ej. según extracto)" />
        </div>
      </div>
      <Button type="submit" disabled={pending}>
        Guardar saldo inicial
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
