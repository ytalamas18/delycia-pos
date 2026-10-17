"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionResult } from "@/core/actions/types";

import { saveKdsThresholdsAction } from "../actions";

export function KdsThresholdsForm({ warn, danger }: { warn: number; danger: number }) {
  const [state, action, pending] = useActionState(saveKdsThresholdsAction, initialActionResult);
  return (
    <form action={action} className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="warn">
            <span className="mr-1 inline-block size-3 rounded-full bg-yellow-400" /> Amarillo desde (min)
          </Label>
          <Input id="warn" name="warnAfterMinutes" type="number" min={1} defaultValue={warn} className="w-28" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="danger">
            <span className="mr-1 inline-block size-3 rounded-full bg-red-500" /> Rojo desde (min)
          </Label>
          <Input id="danger" name="dangerAfterMinutes" type="number" min={2} defaultValue={danger} className="w-28" />
        </div>
        <Button type="submit" disabled={pending}>
          Guardar
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Antes del amarillo, la comanda se ve en verde.</p>
      <FormStatus state={state} />
    </form>
  );
}
