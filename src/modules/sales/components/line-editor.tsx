"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/core/money";
import type { ServiceType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

import type { PosModifier } from "./pos-types";

export type LineEditorValue = {
  quantity: number;
  note: string;
  serviceType: ServiceType;
  modifierIds: string[];
};

/**
 * Ventana para ajustar una línea: cantidad, modificadores, nota y "para llevar".
 * `modifiers` vacío = no se muestran (ej. ítems ya guardados, cuyo precio ya está fijado).
 */
export function LineEditor({
  title,
  initial,
  modifiers,
  onSave,
  onRemove,
  onClose,
}: {
  title: string;
  initial: LineEditorValue;
  modifiers: PosModifier[];
  onSave: (value: LineEditorValue) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const toggleModifier = (id: string) =>
    setValue((v) => ({
      ...v,
      modifierIds: v.modifierIds.includes(id) ? v.modifierIds.filter((m) => m !== id) : [...v.modifierIds, id],
    }));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">Ajustar cantidad, modificadores y nota</DialogDescription>

        <div className="flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="icon"
            className="size-14"
            aria-label="Menos"
            onClick={() => setValue((v) => ({ ...v, quantity: Math.max(1, v.quantity - 1) }))}
          >
            <Minus />
          </Button>
          <span className="w-12 text-center text-3xl font-bold tabular-nums">{value.quantity}</span>
          <Button
            variant="outline"
            size="icon"
            className="size-14"
            aria-label="Más"
            onClick={() => setValue((v) => ({ ...v, quantity: Math.min(99, v.quantity + 1) }))}
          >
            <Plus />
          </Button>
        </div>

        {modifiers.length > 0 && (
          <div className="space-y-2">
            <Label>Modificadores</Label>
            <div className="flex flex-wrap gap-2">
              {modifiers.map((m) => {
                const on = value.modifierIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleModifier(m.id)}
                    className={cn(
                      "h-12 rounded-full border px-4 text-base",
                      on ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                    )}
                  >
                    {m.name}
                    {m.priceDeltaCents > 0 && ` +${formatMoney(m.priceDeltaCents)}`}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="line-note">Nota para cocina</Label>
          <Input
            id="line-note"
            value={value.note}
            maxLength={120}
            placeholder="Ej. bien cocido, sin sal…"
            onChange={(e) => setValue((v) => ({ ...v, note: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(["DINE_IN", "TAKEAWAY"] as const).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={value.serviceType === type}
              onClick={() => setValue((v) => ({ ...v, serviceType: type }))}
              className={cn(
                "h-12 rounded-lg border text-base font-medium",
                value.serviceType === type ? "border-primary bg-primary text-primary-foreground" : "bg-card",
              )}
            >
              {type === "DINE_IN" ? "Comer aquí" : "Para llevar"}
            </button>
          ))}
        </div>

        <div className="flex justify-between gap-2 pt-2">
          <Button variant="ghost" className="text-destructive" onClick={onRemove}>
            Quitar
          </Button>
          <Button size="lg" onClick={() => onSave(value)}>
            Listo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
