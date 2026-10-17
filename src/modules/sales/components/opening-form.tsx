"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionResult } from "@/core/actions/types";
import { formatMoney, parseMoney } from "@/core/money";

import { openCashAction } from "../actions";

/** Apertura de caja: efectivo con el que empieza el día. Se registra UNA vez y no se puede editar. */
export function OpeningForm() {
  const [amount, setAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(openCashAction, initialActionResult);

  let cents: number | null = null;
  try {
    cents = amount.trim() ? parseMoney(amount) : null;
  } catch {
    cents = null;
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="amount">Efectivo inicial en caja (Bs)</Label>
        <Input
          id="amount"
          name="amount"
          inputMode="decimal"
          autoFocus
          placeholder="Ej. 200"
          className="h-14 text-2xl"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setConfirming(false);
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="notes">Observación (opcional)</Label>
        <Input id="notes" name="notes" placeholder="Ej. billetes de 10 y monedas" />
      </div>

      {!confirming ? (
        <Button type="button" size="lg" className="w-full" disabled={cents === null} onClick={() => setConfirming(true)}>
          Abrir caja
        </Button>
      ) : (
        <div className="space-y-3 rounded-lg border-2 border-yellow-400 bg-yellow-50 p-3 text-yellow-950">
          <p>
            ¿Abrir la caja con <strong>{formatMoney(cents ?? 0)}</strong>? <br />
            Este monto <strong>no se podrá cambiar</strong> después.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
              Corregir
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Abriendo…" : "Sí, abrir caja"}
            </Button>
          </div>
        </div>
      )}
      <FormStatus state={state} />
    </form>
  );
}
