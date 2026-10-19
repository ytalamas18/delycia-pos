"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionResult } from "@/core/actions/types";

import { setRecipeYieldAction } from "../actions";

/** Rendimiento de la receta de un Ingrediente (ej. rinde 16 unidades). */
export function RecipeYieldForm({ ownerId, recipeYield, unit }: { ownerId: string; recipeYield: string; unit: string }) {
  const [state, action, pending] = useActionState(setRecipeYieldAction, initialActionResult);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="ownerId" value={ownerId} />
      <div className="w-48 space-y-1">
        <Label htmlFor="recipeYield">Rinde ({unit})</Label>
        <Input id="recipeYield" name="recipeYield" inputMode="decimal" defaultValue={recipeYield} placeholder="Ej. 16" />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        Guardar
      </Button>
      <FieldError state={state} name="recipeYield" />
      <FormStatus state={state} className="w-full" />
    </form>
  );
}
