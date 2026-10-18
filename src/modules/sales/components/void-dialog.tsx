"use client";

import { Ban } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FieldError, FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/core/actions/types";

import type { VoidInput } from "../actions";

const QUICK_REASONS = ["Error al cargar", "Cliente se arrepintió", "Cliente se fue", "Se cobró mal"];

/**
 * Pide el motivo (obligatorio) y, si quien anula no es Admin, el PIN de un Admin.
 * `onConfirm` llama a la acción del servidor; si sale bien, se cierra.
 */
export function VoidDialog({
  title,
  description,
  needsAdminPin,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  needsAdminPin: boolean;
  onConfirm: (input: VoidInput) => Promise<ActionResult>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [adminPin, setAdminPin] = useState("");
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await onConfirm({ reason, adminPin: needsAdminPin ? adminPin : undefined });
      if (result.ok) onClose();
      else setState(result);
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="void-reason">Motivo (obligatorio)</Label>
            <div className="flex flex-wrap gap-2">
              {QUICK_REASONS.map((r) => (
                <Button key={r} type="button" variant="outline" size="sm" onClick={() => setReason(r)}>
                  {r}
                </Button>
              ))}
            </div>
            <Input
              id="void-reason"
              value={reason}
              maxLength={200}
              autoFocus
              placeholder="Escribe el motivo"
              onChange={(e) => setReason(e.target.value)}
            />
            {state && <FieldError state={state} name="reason" />}
          </div>
          {needsAdminPin && (
            <div className="space-y-2">
              <Label htmlFor="void-pin">PIN de Admin</Label>
              <Input
                id="void-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ""))}
              />
              {state && <FieldError state={state} name="adminPin" />}
            </div>
          )}
          {/* El error general solo si no se mostró ya junto a un campo. */}
          {state && !state.ok && !state.fieldErrors && <FormStatus state={state} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={pending}>
              Volver
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="lg"
              disabled={pending || reason.trim().length < 3 || (needsAdminPin && adminPin.length !== 4)}
            >
              <Ban /> {pending ? "Anulando…" : "Anular"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
