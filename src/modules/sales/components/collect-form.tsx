"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { initialActionResult, type ActionResult } from "@/core/actions/types";
import { formatMoneyInput } from "@/core/money";
import { cn } from "@/lib/utils";

import { collectCreditAction } from "../actions";

const METHODS = [
  { value: "CASH", label: "Efectivo" },
  { value: "QR", label: "QR" },
  { value: "CARD", label: "Tarjeta" },
] as const;

/** Registrar el pago (total o un abono) de una cuenta por cobrar. */
export function CollectForm({ paymentId, balanceCents }: { paymentId: string; balanceCents: number }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>("CASH");
  const [state, action, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await collectCreditAction(prev, fd);
    if (result.ok) setOpen(false);
    return result;
  }, initialActionResult);

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <FormStatus state={state} />
        <Button onClick={() => setOpen(true)}>Registrar pago</Button>
      </div>
    );
  }

  return (
    <form
      action={action}
      className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-muted p-2"
    >
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="method" value={method} />
      <div className="flex gap-1">
        {METHODS.map((m) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={method === m.value}
            onClick={() => setMethod(m.value)}
            className={cn("h-11 rounded-md border px-3 font-medium", method === m.value ? "border-primary bg-primary text-primary-foreground" : "bg-card")}
          >
            {m.label}
          </button>
        ))}
      </div>
      <Input name="amount" inputMode="decimal" defaultValue={formatMoneyInput(balanceCents)} className="w-28" aria-label="Monto" />
      <Button type="submit" disabled={pending}>
        Confirmar
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
      <FormStatus state={state} className="w-full" />
    </form>
  );
}
