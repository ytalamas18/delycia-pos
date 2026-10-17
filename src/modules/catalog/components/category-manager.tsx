"use client";

import { useActionState, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { initialActionResult } from "@/core/actions/types";
import { cn } from "@/lib/utils";

import {
  addModifierToCategoryAction,
  createCategoryAction,
  moveCategoryAction,
  renameCategoryAction,
  setCategoryActiveAction,
} from "../actions";
import { RowControls } from "./row-controls";

type CategoryRow = { id: string; name: string; active: boolean; productCount: number };

export function CategoryManager({ categories }: { categories: CategoryRow[] }) {
  const [createState, createAction, creating] = useActionState(createCategoryAction, initialActionResult);

  return (
    <div className="max-w-3xl space-y-6">
      <form action={createAction} className="flex flex-wrap items-start gap-2">
        <div className="min-w-60 flex-1 space-y-1">
          <Input name="name" placeholder="Nueva categoría (ej. Postres)" aria-label="Nombre de la categoría" />
          <FieldError state={createState} name="name" />
        </div>
        <Button type="submit" disabled={creating}>
          Agregar
        </Button>
        <FormStatus state={createState} className="w-full" />
      </form>

      <ul className="divide-y rounded-lg border">
        {categories.map((c, index) => (
          <CategoryItem key={c.id} category={c} isFirst={index === 0} isLast={index === categories.length - 1} />
        ))}
      </ul>
    </div>
  );
}

function CategoryItem({ category, isFirst, isLast }: { category: CategoryRow; isFirst: boolean; isLast: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: typeof initialActionResult, fd: FormData) => {
    const result = await renameCategoryAction(prev, fd);
    if (result.ok) setEditing(false);
    return result;
  }, initialActionResult);

  return (
    <li className={cn("flex flex-wrap items-center gap-3 p-3", !category.active && "opacity-60")}>
      {editing ? (
        <form action={action} className="flex flex-1 flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={category.id} />
          <Input name="name" defaultValue={category.name} className="max-w-xs" autoFocus aria-label="Nombre" />
          <Button type="submit" disabled={pending}>
            Guardar
          </Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
          <FormStatus state={state} className="w-full" />
        </form>
      ) : (
        <button type="button" className="flex flex-1 items-center gap-2 text-left text-lg font-medium" onClick={() => setEditing(true)}>
          {category.name}
          <span className="text-sm font-normal text-muted-foreground">({category.productCount} productos)</span>
          {!category.active && <Badge variant="secondary">Inactiva</Badge>}
        </button>
      )}
      {category.productCount > 0 && <BulkModifier categoryId={category.id} categoryName={category.name} />}
      <RowControls
        active={category.active}
        isFirst={isFirst}
        isLast={isLast}
        onMove={moveCategoryAction.bind(null, category.id)}
        onToggle={setCategoryActiveAction.bind(null, category.id)}
      />
    </li>
  );
}

/** "+ Modificador a todos": agrega el mismo extra a todos los productos de la categoría. */
function BulkModifier({ categoryId, categoryName }: { categoryId: string; categoryName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: typeof initialActionResult, fd: FormData) => {
    const result = await addModifierToCategoryAction(prev, fd);
    if (result.ok) setOpen(false);
    return result;
  }, initialActionResult);

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <FormStatus state={state} />
        <Button variant="outline" onClick={() => setOpen(true)}>
          + Modificador a todos
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="flex w-full flex-wrap items-start gap-2 rounded-lg bg-muted p-2">
      <input type="hidden" name="categoryId" value={categoryId} />
      <span className="w-full text-sm text-muted-foreground">
        Se agrega a todos los productos de <strong>{categoryName}</strong> (los que ya lo tienen no cambian).
      </span>
      <div className="min-w-48 flex-1 space-y-1">
        <Input name="name" placeholder="Ej. Extra cheddar" aria-label="Modificador" autoFocus />
        <FieldError state={state} name="name" />
      </div>
      <div className="w-36 space-y-1">
        <Input name="priceDelta" inputMode="decimal" placeholder="+ Bs (opcional)" aria-label="Recargo" />
        <FieldError state={state} name="priceDeltaCents" />
      </div>
      <Button type="submit" disabled={pending}>
        Agregar a todos
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
      <FormStatus state={state} className="w-full" />
    </form>
  );
}
