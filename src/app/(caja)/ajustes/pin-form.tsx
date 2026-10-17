"use client";

import { type FormEvent, startTransition, useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionResult } from "@/core/actions/types";

import { changePinAction } from "./actions";

const pinProps = {
  type: "password",
  inputMode: "numeric",
  pattern: "\\d{4}",
  maxLength: 4,
  required: true,
  autoComplete: "off",
  className: "w-28",
} as const;

export function PinForm({ users }: { users: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(changePinAction, initialActionResult);

  // Con <form action> React reinicia todo el formulario y el usuario elegido volvía a "Admin" (se cambiaba
  // el PIN equivocado). Se envía a mano y solo se vacían los campos de PIN.
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    e.currentTarget.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach((i) => (i.value = ""));
    startTransition(() => action(fd));
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="userId">Usuario</Label>
          <select id="userId" name="userId" className="h-11 rounded-md border border-input bg-background px-3 text-base">
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPin">PIN nuevo</Label>
          <Input id="newPin" name="newPin" {...pinProps} />
          <FieldError state={state} name="newPin" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPin">Repetir PIN</Label>
          <Input id="confirmPin" name="confirmPin" {...pinProps} />
          <FieldError state={state} name="confirmPin" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="adminPin">Tu PIN (Admin)</Label>
          <Input id="adminPin" name="adminPin" {...pinProps} />
          <FieldError state={state} name="adminPin" />
        </div>
        <Button type="submit" disabled={pending}>
          Cambiar PIN
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        4 dígitos. No se aceptan PIN fáciles (1111, 1234, años). Cambiar el PIN también desbloquea al usuario si se
        bloqueó por intentos fallidos.
      </p>
      <FormStatus state={state} />
    </form>
  );
}
