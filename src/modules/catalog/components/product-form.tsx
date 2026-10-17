"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SwitchField } from "@/components/ui/switch-field";
import { initialActionResult } from "@/core/actions/types";

import { saveProductAction } from "../actions";

type ProductFormProps = {
  categories: { id: string; name: string }[];
  product?: {
    id: string;
    name: string;
    categoryId: string;
    price: string;
    sendsToKitchen: boolean;
    active: boolean;
  };
  defaultCategoryId?: string;
};

export function ProductForm({ categories, product, defaultCategoryId }: ProductFormProps) {
  const [state, action, pending] = useActionState(saveProductAction, initialActionResult);

  return (
    <form action={action} className="max-w-xl space-y-5">
      <input type="hidden" name="id" value={product?.id ?? ""} />

      <div className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" defaultValue={product?.name} placeholder="Ej. Salchipapa de pollo" required />
        <FieldError state={state} name="name" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="categoryId">Categoría</Label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={product?.categoryId ?? defaultCategoryId ?? categories[0]?.id}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <FieldError state={state} name="categoryId" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="price">Precio en local (Bs)</Label>
          <Input id="price" name="price" inputMode="decimal" defaultValue={product?.price} placeholder="38" required />
          <FieldError state={state} name="priceCents" />
        </div>
      </div>

      <SwitchField
        name="sendsToKitchen"
        defaultChecked={product?.sendsToKitchen ?? true}
        label="Va a cocina"
        hint="Desmárcalo para bebidas u otros productos que no se preparan (no generan comanda)."
      />
      <SwitchField
        name="active"
        defaultChecked={product?.active ?? true}
        label="Activo"
        hint="Si está inactivo no aparece en la pantalla de venta."
      />

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {product ? "Guardar cambios" : "Crear producto"}
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
