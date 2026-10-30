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
 * Pide el motivo (obligatorio) y, si el rol de quien anula no puede autorizar, el usuario y PIN de alguien
 * que sí (ej. un Admin o un encargado).
 * `onConfirm` llama a la acción del servidor; si sale bien, se cierra.
 */
export function VoidDialog({
  title,
  description,
  needsAuthorization,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  needsAuthorization: boolean;
  onConfirm: (input: VoidInput) => Promise<ActionResult>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPin, setAuthPin] = useState("");
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await onConfirm(needsAuthorization ? { reason, authUsername, authPin } : { reason });
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
          {needsAuthorization && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Autoriza (usuario y PIN de un encargado)</legend>
              <div className="grid grid-cols-[1fr_7rem] gap-2">
                <div className="space-y-1">
                  <Label htmlFor="void-user">Usuario</Label>
                  <Input
                    id="void-user"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="void-pin">PIN</Label>
                  <Input
                    id="void-pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                    value={authPin}
                    onChange={(e) => setAuthPin(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </div>
              {state && <FieldError state={state} name="authUsername" />}
              {state && <FieldError state={state} name="authPin" />}
            </fieldset>
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
              disabled={pending || reason.trim().length < 3 || (needsAuthorization && (!authUsername.trim() || authPin.length !== 4))}
            >
              <Ban /> {pending ? "Anulando…" : "Anular"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
