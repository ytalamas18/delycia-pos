"use client";

import { X } from "lucide-react";
import { useActionState, useRef, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { initialActionResult, type ActionResult } from "@/core/actions/types";
import { formatMoney } from "@/core/money";

import { addModifierAction, removeModifierAction } from "../actions";

type Modifier = { id: string; name: string; priceDeltaCents: number };

export function ModifierEditor({ productId, modifiers }: { productId: string; modifiers: Modifier[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await addModifierAction(prev, fd);
    if (result.ok) formRef.current?.reset();
    return result;
  }, initialActionResult);
  const [removing, startRemove] = useTransition();

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Botones rápidos para el cajero, ej. &quot;Sin cebolla&quot; (sin costo) o &quot;Extra huevo&quot; (+5). Además
        siempre se puede escribir una nota libre al vender.
      </p>

      {modifiers.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {modifiers.map((m) => (
            <li key={m.id} className="flex items-center gap-1 rounded-full border py-1 pr-1 pl-3">
              <span>
                {m.name}
                {m.priceDeltaCents > 0 && (
                  <span className="text-muted-foreground"> +{formatMoney(m.priceDeltaCents)}</span>
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="size-8 rounded-full p-0"
                aria-label={`Quitar ${m.name}`}
                disabled={removing}
                onClick={() => startRemove(() => removeModifierAction(m.id))}
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form ref={formRef} action={action} className="flex flex-wrap items-start gap-2">
        <input type="hidden" name="productId" value={productId} />
        <div className="min-w-48 flex-1 space-y-1">
          <Input name="name" placeholder="Ej. Sin cebolla" aria-label="Modificador" />
          <FieldError state={state} name="name" />
        </div>
        <div className="w-32 space-y-1">
          <Input name="priceDelta" inputMode="decimal" placeholder="+ Bs (opcional)" aria-label="Recargo" />
          <FieldError state={state} name="priceDeltaCents" />
        </div>
        <Button type="submit" disabled={pending}>
          Agregar
        </Button>
        <FormStatus state={state} className="w-full" />
      </form>
    </div>
  );
}
