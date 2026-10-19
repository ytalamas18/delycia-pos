"use client";

import { X } from "lucide-react";
import { useActionState, useRef, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { initialActionResult, type ActionResult } from "@/core/actions/types";
import type { BaseUnit } from "@/generated/prisma/enums";

import { addPresentationAction, removePresentationAction } from "../actions";
import { UNIT_LABEL } from "../domain/unit-labels";

type Presentation = { id: string; name: string; factor: string };

export function PresentationEditor({
  productId,
  baseUnit,
  presentations,
}: {
  productId: string;
  baseUnit: BaseUnit;
  presentations: Presentation[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await addPresentationAction(prev, fd);
    if (result.ok) formRef.current?.reset();
    return result;
  }, initialActionResult);
  const [removing, startRemove] = useTransition();
  const unit = UNIT_LABEL[baseUnit];

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Cómo lo compras, ej. &quot;Bolsa x12&quot; = 12 {unit}. Al comprar 2 bolsas suma 24 al stock. Siempre se puede
        comprar también en {unit}.
      </p>

      {presentations.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {presentations.map((p) => (
            <li key={p.id} className="flex items-center gap-1 rounded-full border py-1 pr-1 pl-3">
              <span>
                {p.name}
                <span className="text-muted-foreground">
                  {" "}
                  = {p.factor} {unit}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="size-8 rounded-full p-0"
                aria-label={`Quitar ${p.name}`}
                disabled={removing}
                onClick={() => startRemove(() => removePresentationAction(p.id))}
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
          <Input name="name" placeholder="Ej. Bolsa x12" aria-label="Presentación" />
          <FieldError state={state} name="name" />
        </div>
        <div className="w-36 space-y-1">
          <Input name="factor" inputMode="decimal" placeholder={`Trae (${unit})`} aria-label={`Cantidad en ${unit}`} />
          <FieldError state={state} name="factor" />
        </div>
        <Button type="submit" disabled={pending}>
          Agregar
        </Button>
        <FormStatus state={state} className="w-full" />
      </form>
    </div>
  );
}
