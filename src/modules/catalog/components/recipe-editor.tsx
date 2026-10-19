"use client";

import { Copy, X } from "lucide-react";
import { useActionState, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { initialActionResult, type ActionResult } from "@/core/actions/types";
import type { ItemType, RecipeCondition } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

import {
  copyModifierRecipeAction,
  removeModifierRecipeLineAction,
  removeRecipeLineAction,
  setModifierRecipeLineAction,
  setRecipeLineAction,
} from "../actions";
import { ITEM_TYPE_PLURAL } from "../domain/item-types";
import { RECIPE_CONDITION_LABEL, RECIPE_CONDITIONS } from "../domain/recipe-conditions";

/** Línea ya formateada por el servidor (los Decimal no cruzan al cliente). */
export type RecipeLineRow = {
  id: string;
  name: string;
  unit: string;
  tracksStock: boolean;
  quantity: string;
  condition: RecipeCondition;
  unitCost: string | null;
  lineCost: string | null;
};

export type ComponentOption = { id: string; name: string; type: ItemType; unit: string; category: string };

const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-base";

/**
 * Lista de componentes de una receta + formulario para agregar.
 * - "recipe": receta de Preparado (con condición para llevar / comer aquí) o de Ingrediente (sin condición).
 * - "modifier": lo que descuenta un modificador.
 */
export function RecipeEditor({
  kind,
  ownerId,
  lines,
  components,
  showCondition,
}: {
  kind: "recipe" | "modifier";
  ownerId: string;
  lines: RecipeLineRow[];
  components: ComponentOption[];
  showCondition: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [componentId, setComponentId] = useState("");
  const save = kind === "recipe" ? setRecipeLineAction : setModifierRecipeLineAction;
  const [state, action, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const result = await save(prev, fd);
    if (result.ok) {
      formRef.current?.reset();
      setComponentId("");
    }
    return result;
  }, initialActionResult);
  const [removing, startRemove] = useTransition();
  const remove = kind === "recipe" ? removeRecipeLineAction : removeModifierRecipeLineAction;
  const unit = components.find((c) => c.id === componentId)?.unit;
  const groups = [...new Set(components.map((c) => c.type))];

  return (
    <div className="space-y-3">
      {lines.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">Componente</th>
                <th className="p-2 text-right font-medium">Cantidad</th>
                {showCondition && <th className="p-2 font-medium">Cuándo</th>}
                <th className="p-2 text-right font-medium">Costo unit.</th>
                <th className="p-2 text-right font-medium">Costo</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="p-2">
                    {l.name}
                    {!l.tracksStock && <span className="text-xs text-muted-foreground"> · sin stock</span>}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {l.quantity} {l.unit}
                  </td>
                  {showCondition && (
                    <td className={cn("p-2", l.condition !== "ALWAYS" && "font-medium")}>{RECIPE_CONDITION_LABEL[l.condition]}</td>
                  )}
                  <td className="p-2 text-right tabular-nums">{l.unitCost ?? "—"}</td>
                  <td className="p-2 text-right tabular-nums">
                    {l.lineCost ?? <span className="text-amber-700 dark:text-amber-400">sin costo</span>}
                  </td>
                  <td className="p-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-8 p-0"
                      aria-label={`Quitar ${l.name}`}
                      disabled={removing}
                      onClick={() => startRemove(() => remove(l.id))}
                    >
                      <X className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form ref={formRef} action={action} className="flex flex-wrap items-start gap-2">
        <input type="hidden" name="ownerId" value={ownerId} />
        <div className="min-w-56 flex-1 space-y-1">
          <select
            name="componentId"
            value={componentId}
            onChange={(e) => setComponentId(e.target.value)}
            className={selectClass}
            aria-label="Componente"
          >
            <option value="">Elegir componente…</option>
            {groups.map((type) => (
              <optgroup key={type} label={ITEM_TYPE_PLURAL[type]}>
                {components
                  .filter((c) => c.type === type)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.unit})
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <FieldError state={state} name="componentId" />
        </div>
        <div className="w-36 space-y-1">
          <Input name="quantity" inputMode="decimal" placeholder={unit ? `Cantidad (${unit})` : "Cantidad"} aria-label="Cantidad" />
          <FieldError state={state} name="quantity" />
        </div>
        {showCondition && (
          <select name="condition" defaultValue="ALWAYS" className={cn(selectClass, "w-44")} aria-label="Cuándo">
            {RECIPE_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {RECIPE_CONDITION_LABEL[c]}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" disabled={pending}>
          Agregar
        </Button>
        <FormStatus state={state} className="w-full" />
      </form>
      {components.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No hay componentes para elegir: crea primero los Insumos/Ingredientes en el Catálogo.
        </p>
      )}
    </div>
  );
}

/** Copia lo que descuenta un modificador a todos los que tienen el mismo nombre. */
export function CopyModifierRecipeButton({ modifierId, name }: { modifierId: string; name: string }) {
  const [state, setState] = useState<ActionResult>(initialActionResult);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => start(async () => setState(await copyModifierRecipeAction(modifierId)))}
      >
        <Copy className="size-4" /> Copiar a todos los &quot;{name}&quot;
      </Button>
      <FormStatus state={state} />
    </div>
  );
}
