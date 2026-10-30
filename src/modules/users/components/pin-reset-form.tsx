"use client";

import { type FormEvent, startTransition, useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionResult } from "@/core/actions/types";

import { resetPinAction } from "../actions";
import { pinInputProps } from "./pin-input";

export function PinResetForm({ userId }: { userId: string }) {
  const [state, action, pending] = useActionState(resetPinAction, initialActionResult);

  // Se envía a mano para vaciar solo los PIN (con <form action> React reinicia todo el formulario).
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    e.currentTarget.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach((i) => (i.value = ""));
    startTransition(() => action(fd));
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="newPin">PIN nuevo</Label>
          <Input id="newPin" name="newPin" {...pinInputProps} />
          <FieldError state={state} name="newPin" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPin">Repetir PIN</Label>
          <Input id="confirmPin" name="confirmPin" {...pinInputProps} />
          <FieldError state={state} name="confirmPin" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="actorPin">Tu PIN</Label>
          <Input id="actorPin" name="actorPin" {...pinInputProps} />
          <FieldError state={state} name="actorPin" />
        </div>
        <Button type="submit" disabled={pending}>
          Cambiar PIN
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        4 dígitos. No se aceptan PIN fáciles (1111, 1234, años). También desbloquea al usuario y cierra sus sesiones
        abiertas.
      </p>
      <FormStatus state={state} />
    </form>
  );
}
