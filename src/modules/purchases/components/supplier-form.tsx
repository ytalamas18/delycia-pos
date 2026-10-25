"use client";

import { useActionState, useRef } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SwitchField } from "@/components/ui/switch-field";
import { initialActionResult, type ActionResult } from "@/core/actions/types";

import { saveSupplierAction } from "../actions";

type Supplier = { id: string; name: string; phone: string | null; document: string | null; note: string | null; active: boolean };

export function SupplierForm({ supplier }: { supplier?: Supplier }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await saveSupplierAction(prev, fd);
    if (r.ok && !supplier) ref.current?.reset();
    return r;
  }, initialActionResult);
  return (
    <form ref={ref} action={action} className="grid max-w-2xl gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={supplier?.id ?? ""} />
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" defaultValue={supplier?.name} placeholder="Ej. Distribuidora El Carnicero" />
        <FieldError state={state} name="name" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="phone">Teléfono</Label>
        <Input id="phone" name="phone" defaultValue={supplier?.phone ?? ""} inputMode="tel" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="document">RUC / NIT / CI (opcional)</Label>
        <Input id="document" name="document" defaultValue={supplier?.document ?? ""} />
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="note">Nota</Label>
        <Input id="note" name="note" defaultValue={supplier?.note ?? ""} placeholder="Opcional" />
      </div>
      {supplier && (
        <>
          <input type="hidden" name="active" value="off" />
          <SwitchField name="active" value="on" defaultChecked={supplier.active} label="Activo" className="sm:col-span-2" />
        </>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {supplier ? "Guardar" : "Agregar proveedor"}
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
