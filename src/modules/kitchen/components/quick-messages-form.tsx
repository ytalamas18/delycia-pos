"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import { Label } from "@/components/ui/label";
import { initialActionResult } from "@/core/actions/types";

import { saveQuickMessagesAction } from "../actions";

/** Editar los botones de mensajes rápidos a cocina (uno por línea). */
export function QuickMessagesForm({ messages }: { messages: string[] }) {
  const [state, action, pending] = useActionState(saveQuickMessagesAction, initialActionResult);
  return (
    <form action={action} className="space-y-3">
      <Label htmlFor="messages">Un mensaje por línea (máximo 12, hasta 60 caracteres cada uno)</Label>
      <textarea
        id="messages"
        name="messages"
        rows={6}
        defaultValue={messages.join("\n")}
        className="w-full rounded-md border border-input bg-transparent p-3 text-base uppercase"
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          Guardar
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
