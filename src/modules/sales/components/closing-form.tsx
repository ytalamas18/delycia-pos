"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionResult } from "@/core/actions/types";
import { formatMoney, formatMoneyInput, parseMoney } from "@/core/money";
import { cn } from "@/lib/utils";

import { saveClosingAction } from "../actions";

function cents(text: string) {
  try {
    return text.trim() ? parseMoney(text) : 0;
  } catch {
    return 0;
  }
}

/** Arqueo: fondo inicial + efectivo contado → diferencia contra lo esperado. */
export function ClosingForm({
  date,
  cashInCents,
  saved,
}: {
  date: string;
  /** Efectivo que entró hoy (ventas + cobros de fiado). */
  cashInCents: number;
  saved: { openingCashCents: number; countedCashCents: number; notes: string | null } | null;
}) {
  const [opening, setOpening] = useState(saved ? formatMoneyInput(saved.openingCashCents) : "");
  const [counted, setCounted] = useState(saved ? formatMoneyInput(saved.countedCashCents) : "");
  const [state, action, pending] = useActionState(saveClosingAction, initialActionResult);

  const expected = cents(opening) + cashInCents;
  const difference = cents(counted) - expected;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="fecha" value={date} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="opening">Fondo inicial de caja (Bs)</Label>
          <Input id="opening" name="opening" inputMode="decimal" placeholder="0" value={opening} onChange={(e) => setOpening(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="counted">Efectivo contado al cerrar (Bs)</Label>
          <Input id="counted" name="counted" inputMode="decimal" required value={counted} onChange={(e) => setCounted(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1 rounded-lg bg-muted p-3 text-lg">
        <div className="flex justify-between">
          <span>Efectivo esperado en caja</span>
          <span className="font-semibold tabular-nums">{formatMoney(expected)}</span>
        </div>
        {counted.trim() !== "" && (
          <div
            className={cn(
              "flex justify-between font-bold",
              difference === 0 ? "text-green-700" : difference < 0 ? "text-destructive" : "text-blue-700",
            )}
          >
            <span>{difference === 0 ? "Cuadra ✔" : difference < 0 ? "Falta" : "Sobra"}</span>
            <span className="tabular-nums">{formatMoney(Math.abs(difference))}</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Observaciones (opcional)</Label>
        <Input id="notes" name="notes" defaultValue={saved?.notes ?? ""} placeholder="Ej. se pagó el gas con caja" />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending || counted.trim() === ""}>
          {saved ? "Actualizar cierre" : "Guardar cierre"}
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
