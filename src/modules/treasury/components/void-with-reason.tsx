"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { initialActionResult, type ActionResult } from "@/core/actions/types";

/** Botón "Anular" que pide el motivo antes de confirmar. */
export function VoidWithReason({
  id,
  label,
  action,
}: {
  id: string;
  label: string;
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, initialActionResult);
  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="reason" placeholder="Motivo (obligatorio)" aria-label="Motivo" className="h-9 w-56" autoFocus required />
      <Button type="submit" variant="destructive" size="sm" disabled={pending}>
        Anular
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
      {!state.ok && <FormStatus state={state} className="w-full" />}
    </form>
  );
}
