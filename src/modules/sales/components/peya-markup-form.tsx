"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionResult } from "@/core/actions/types";
import { formatMoney } from "@/core/money";

import { savePeyaMarkupAction } from "../actions";
import { unitPriceFor } from "../domain/pricing";

type Sample = { name: string; priceCents: number };

export function PeyaMarkupForm({ currentPercent, samples }: { currentPercent: number; samples: Sample[] }) {
  const [state, action, pending] = useActionState(savePeyaMarkupAction, initialActionResult);
  const [value, setValue] = useState(String(currentPercent));
  const percent = Number(value.replace(",", "."));
  const valid = Number.isFinite(percent) && percent >= 0;

  return (
    <form action={action} className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="percent">Recargo PEYA (%)</Label>
          <Input
            id="percent"
            name="percent"
            inputMode="decimal"
            className="w-32 text-lg"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={pending || !valid}>
          Guardar
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Se aplica a todos los productos (bebidas incluidas) y el resultado se redondea al boliviano entero.
      </p>
      {valid && samples.length > 0 && (
        <table className="w-full max-w-md text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-medium">Producto</th>
              <th className="py-1 text-right font-medium">Local</th>
              <th className="py-1 text-right font-medium">PEYA</th>
            </tr>
          </thead>
          <tbody>
            {samples.map((s) => (
              <tr key={s.name} className="border-t">
                <td className="py-1.5">{s.name}</td>
                <td className="py-1.5 text-right tabular-nums">{formatMoney(s.priceCents)}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">
                  {formatMoney(unitPriceFor({ listPriceCents: s.priceCents, channel: "PEYA", markupPercent: percent }))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <FormStatus state={state} />
    </form>
  );
}
