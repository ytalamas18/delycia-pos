"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SwitchField } from "@/components/ui/switch-field";
import { initialActionResult } from "@/core/actions/types";
import type { BaseUnit, ItemType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

import { saveProductAction } from "../actions";
import { ITEM_TYPE_HINT, ITEM_TYPE_LABEL, ITEM_TYPES, isSellable, tracksStockFor } from "../domain/item-types";
import { BASE_UNITS, UNIT_LABEL } from "../domain/unit-labels";

type ProductFormProps = {
  categories: { id: string; name: string }[];
  product?: {
    id: string;
    name: string;
    categoryId: string;
    type: ItemType;
    price: string;
    sendsToKitchen: boolean;
    active: boolean;
    baseUnit: BaseUnit;
    tracksStock: boolean;
    minStock: string;
    lastCost: string;
  };
  defaultCategoryId?: string;
};

const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-base";

export function ProductForm({ categories, product, defaultCategoryId }: ProductFormProps) {
  const [state, action, pending] = useActionState(saveProductAction, initialActionResult);
  const [type, setType] = useState<ItemType>(product?.type ?? "NORMAL");
  const [checked, setChecked] = useState(product?.tracksStock ?? false);
  const [unit, setUnit] = useState<BaseUnit>(product?.baseUnit ?? "UNIT");
  const sellable = isSellable(type);
  const stock = tracksStockFor(type, checked);
  const unitLabel = UNIT_LABEL[type === "PREPARED" ? "UNIT" : unit];

  return (
    <form action={action} className="max-w-xl space-y-5">
      <input type="hidden" name="id" value={product?.id ?? ""} />

      <div className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" defaultValue={product?.name} placeholder="Ej. Salchipapa de pollo" required />
        <FieldError state={state} name="name" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="type">Tipo</Label>
        <select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as ItemType)} className={selectClass}>
          {ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {ITEM_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <p className="text-sm text-muted-foreground">{ITEM_TYPE_HINT[type]}</p>
        <FieldError state={state} name="type" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="categoryId">Categoría</Label>
          <select
            id="categoryId"
            name="categoryId"
            defaultValue={product?.categoryId ?? defaultCategoryId ?? categories[0]?.id}
            className={selectClass}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <FieldError state={state} name="categoryId" />
        </div>
        <div className={cn("space-y-2", !sellable && "hidden")}>
          <Label htmlFor="price">Precio en local (Bs)</Label>
          <Input id="price" name="price" inputMode="decimal" defaultValue={product?.price} placeholder="38" />
          <FieldError state={state} name="priceCents" />
        </div>
      </div>

      <div className={cn("grid gap-4 sm:grid-cols-2", type === "PREPARED" && "hidden")}>
        <div className="space-y-2">
          <Label htmlFor="baseUnit">Unidad base</Label>
          <select
            id="baseUnit"
            name="baseUnit"
            value={unit}
            onChange={(e) => setUnit(e.target.value as BaseUnit)}
            className={selectClass}
          >
            {BASE_UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground">Stock, recetas y costos se cuentan en esta unidad.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastCost">Último costo (Bs por {unitLabel})</Label>
          <Input id="lastCost" name="lastCost" inputMode="decimal" defaultValue={product?.lastCost} placeholder="Opcional" />
          <p className="text-sm text-muted-foreground">Se actualiza solo con cada compra.</p>
          <FieldError state={state} name="lastCostCents" />
        </div>
      </div>

      {(type === "NORMAL" || type === "SUPPLY") && (
        <SwitchField
          name="tracksStock"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          label="Suma al inventario al registrar compra"
          hint="Marcado: maneja stock (sube con compras, baja con ventas o recetas). Sin marcar: solo se registra el gasto."
        />
      )}
      {type === "INGREDIENT" && <p className="text-sm text-muted-foreground">Un Ingrediente siempre maneja stock.</p>}

      <div className={cn("grid max-w-xs gap-2", !stock && "hidden")}>
        <Label htmlFor="minStock">Stock mínimo ({unitLabel})</Label>
        <Input id="minStock" name="minStock" inputMode="decimal" defaultValue={product?.minStock} placeholder="Opcional" />
        <p className="text-sm text-muted-foreground">Avisa cuando el stock baja de esta cantidad.</p>
        <FieldError state={state} name="minStock" />
      </div>

      {sellable && (
        <SwitchField
          name="sendsToKitchen"
          defaultChecked={product?.sendsToKitchen ?? true}
          label="Va a cocina"
          hint="Desmárcalo para bebidas u otros productos que no se preparan (no generan comanda)."
        />
      )}
      <SwitchField
        name="active"
        defaultChecked={product?.active ?? true}
        label="Activo"
        hint={sellable ? "Si está inactivo no aparece en la pantalla de venta." : "Si está inactivo no aparece para comprar ni en recetas."}
      />

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {product ? "Guardar cambios" : "Crear ítem"}
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
