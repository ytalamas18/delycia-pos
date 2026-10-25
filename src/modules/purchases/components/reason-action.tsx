"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { initialActionResult, type ActionResult } from "@/core/actions/types";

/** Botón que pide un motivo antes de confirmar (anular compra, anular pago). */
export function ReasonAction({
  label,
  confirmLabel,
  hidden,
  action,
  size = "sm",
}: {
  label: string;
  confirmLabel: string;
  hidden: Record<string, string>;
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialActionResult);
  if (!open) {
    return (
      <Button variant="outline" size={size} className="text-destructive" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Input name="reason" placeholder="Motivo (obligatorio)" className="w-64" autoFocus aria-label="Motivo" />
      <Button type="submit" variant="destructive" size={size} disabled={pending}>
        {confirmLabel}
      </Button>
      <Button type="button" variant="ghost" size={size} onClick={() => setOpen(false)}>
        Cancelar
      </Button>
      <FormStatus state={state} className="w-full" />
    </form>
  );
}
