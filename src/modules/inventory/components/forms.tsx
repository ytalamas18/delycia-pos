"use client";

import { useActionState, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionResult, type ActionResult } from "@/core/actions/types";

import { createConsumptionAction, createCountAction, createProductionAction } from "../actions";

const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-base";

/** Opción serializable (sin Decimal). */
export type ItemOption = { id: string; name: string; unit: string; hint?: string };

function useResettingAction(action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await action(prev, fd);
    if (r.ok) ref.current?.reset();
    return r;
  }, initialActionResult);
  return { ref, state, formAction, pending };
}

/** Ingreso a inventario (producción de un Ingrediente). */
export function ProductionForm({ ingredients, today }: { ingredients: (ItemOption & { estimate: string })[]; today: string }) {
  const { ref, state, formAction, pending } = useResettingAction(createProductionAction);
  const [id, setId] = useState("");
  const item = ingredients.find((i) => i.id === id);
  return (
    <form ref={ref} action={formAction} className="grid max-w-3xl gap-3 sm:grid-cols-2">
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="productId">Ingrediente</Label>
        <select id="productId" name="productId" value={id} onChange={(e) => setId(e.target.value)} className={selectClass}>
          <option value="">Elegir…</option>
          {ingredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <FieldError state={state} name="productId" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="quantity">Cantidad producida {item && `(${item.unit})`}</Label>
        <Input id="quantity" name="quantity" inputMode="decimal" />
        <FieldError state={state} name="quantity" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="date">Fecha</Label>
        <Input id="date" name="date" type="date" defaultValue={today} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="unitCost">Costo por {item?.unit ?? "unidad"} (Bs)</Label>
        <Input id="unitCost" name="unitCost" inputMode="decimal" placeholder={item?.estimate ? `Receta: ${item.estimate}` : "Opcional"} />
        <span className="text-xs text-muted-foreground">Vacío = el estimado por la receta. Escríbelo si ese día fue distinto.</span>
        <FieldError state={state} name="unitCost" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="note">Nota</Label>
        <Input id="note" name="note" placeholder="Opcional" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          Registrar ingreso
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}

/** Conteo físico: lo contado de varios ítems a la vez. Solo se guardan las filas llenadas. */
export function CountForm({ items, today }: { items: (ItemOption & { expected: string })[]; today: string }) {
  const [values, setValues] = useState<Record<string, { counted: string; reason: string }>>({});
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const filled = Object.entries(values).filter(([, v]) => v.counted.trim() !== "");
  const set = (id: string, patch: Partial<{ counted: string; reason: string }>) =>
    setValues((vs) => ({ ...vs, [id]: { ...(vs[id] ?? { counted: "", reason: "" }), ...patch } }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <Label htmlFor="count-date">Fecha del conteo</Label>
          <Input id="count-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
        <div className="grid min-w-64 flex-1 gap-1">
          <Label htmlFor="count-note">Nota</Label>
          <Input id="count-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. conteo de cierre de mes" />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-xl text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="p-2">Ítem</th>
              <th className="p-2 text-right">Sistema</th>
              <th className="p-2">Contado</th>
              <th className="p-2">Motivo (si hay diferencia)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((i) => (
              <tr key={i.id}>
                <td className="p-2 font-medium">{i.name}</td>
                <td className="p-2 text-right tabular-nums">
                  {i.expected} {i.unit}
                </td>
                <td className="p-2">
                  <Input
                    inputMode="decimal"
                    aria-label={`Contado ${i.name}`}
                    value={values[i.id]?.counted ?? ""}
                    onChange={(e) => set(i.id, { counted: e.target.value })}
                    className="w-32"
                  />
                </td>
                <td className="p-2">
                  <Input aria-label={`Motivo ${i.name}`} value={values[i.id]?.reason ?? ""} onChange={(e) => set(i.id, { reason: e.target.value })} placeholder="Ej. merma, se quemó" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={pending || filled.length === 0}
          onClick={() =>
            start(async () => {
              const r = await createCountAction({
                date,
                note,
                lines: filled.map(([productId, v]) => ({ productId, counted: v.counted, reason: v.reason })),
              });
              setState(r);
              if (r.ok) setValues({});
            })
          }
        >
          Guardar conteo ({filled.length})
        </Button>
        {state && <FormStatus state={state} />}
      </div>
      <p className="text-sm text-muted-foreground">
        La diferencia (contado − sistema) se registra como ajuste: si falta es merma, si sobra es sobrante.
      </p>
    </div>
  );
}

const QUICK_REASONS = ["Envase para sobras", "Se rompió / dañó", "Consumo del personal"];

/** Salida rápida (Caja y Admin): ej. envase para que el cliente se lleve lo que no terminó. */
export function ConsumptionForm({ items }: { items: ItemOption[] }) {
  const { ref, state, formAction, pending } = useResettingAction(createConsumptionAction);
  const [reason, setReason] = useState(QUICK_REASONS[0]);
  return (
    <form ref={ref} action={formAction} className="grid max-w-2xl gap-3 sm:grid-cols-[1fr_8rem]">
      <div className="grid gap-1">
        <Label htmlFor="c-item">Ítem</Label>
        <select id="c-item" name="productId" className={selectClass} defaultValue="">
          <option value="">Elegir…</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.unit})
            </option>
          ))}
        </select>
        <FieldError state={state} name="productId" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="c-qty">Cantidad</Label>
        <Input id="c-qty" name="quantity" inputMode="decimal" defaultValue="1" />
        <FieldError state={state} name="quantity" />
      </div>
      <div className="grid gap-1 sm:col-span-2">
        <Label htmlFor="c-reason">Motivo</Label>
        <div className="flex flex-wrap gap-2">
          {QUICK_REASONS.map((r) => (
            <Button key={r} type="button" size="sm" variant={reason === r ? "default" : "outline"} onClick={() => setReason(r)}>
              {r}
            </Button>
          ))}
        </div>
        <Input id="c-reason" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <FieldError state={state} name="reason" />
      </div>
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          Registrar salida
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
