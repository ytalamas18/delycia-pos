"use client";

import { HandCoins } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionResult, type ActionResult } from "@/core/actions/types";
import { appConfig } from "@/core/config/app";
import { formatMoney } from "@/core/money";

import { createWithdrawalAction, todayWithdrawalsAction, voidWithdrawalAction } from "../actions";
import type { WithdrawalLine } from "../services/withdrawals";

const time = new Intl.DateTimeFormat("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: appConfig.timezone });

/** Botón de la barra superior: registrar un retiro de efectivo de la caja y ver/anular los de hoy. */
export function WithdrawalButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        aria-label="Retiro de efectivo"
        onClick={() => setOpen(true)}
        className="border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-300"
      >
        <HandCoins /> <span className="hidden sm:inline">Retiro de efectivo</span>
      </Button>
      {open && <WithdrawalDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function WithdrawalDialog({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<WithdrawalLine[] | null>(null);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [kind, setKind] = useState<"RELIEF" | "OWNER">("RELIEF");
  const [carrier, setCarrier] = useState("");
  const [loading, startLoading] = useTransition();
  const reload = () =>
    startLoading(async () => {
      const r = await todayWithdrawalsAction();
      setList(r.list);
      setUsers(r.users);
      // Por defecto se lo lleva quien registra.
      setCarrier((c) => c || r.me);
    });
  // Carga los retiros de hoy al abrir.
  useEffect(reload, []);

  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await createWithdrawalAction(prev, fd);
    if (r.ok) {
      setFormKey((k) => k + 1); // limpia el formulario
      reload();
    }
    return r;
  }, initialActionResult);

  const active = (list ?? []).filter((w) => !w.voidedAt);
  const total = active.reduce((s, w) => s + w.amountCents, 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogTitle>Retiro de efectivo</DialogTitle>
        <DialogDescription>Sale de la caja de hoy y resta del efectivo esperado en el cierre.</DialogDescription>
        <form key={formKey} action={formAction} className="space-y-3">
          <input type="hidden" name="kind" value={kind} />
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Tipo de retiro">
            {(["RELIEF", "OWNER"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`h-10 rounded-md text-sm font-medium ${kind === k ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                {k === "RELIEF" ? "Alivio (para depositar)" : "Retiro del dueño"}
              </button>
            ))}
          </div>
          {kind === "RELIEF" && (
            <div className="space-y-1">
              <Label htmlFor="withdrawal-carrier">Quién se lleva la plata</Label>
              <select
                id="withdrawal-carrier"
                name="carriedById"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-base"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="withdrawal-amount">Monto (Bs)</Label>
            <Input id="withdrawal-amount" name="amount" inputMode="decimal" placeholder="Ej. 200" className="h-12 text-xl" autoFocus required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="withdrawal-reason">{kind === "RELIEF" ? "Nota (opcional)" : "Motivo"}</Label>
            <Input
              id="withdrawal-reason"
              name="reason"
              maxLength={200}
              placeholder={kind === "RELIEF" ? "Alivio" : "Ej. Retiro del dueño, pago de un gasto"}
              required={kind === "OWNER"}
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Guardando…" : kind === "RELIEF" ? "Registrar alivio" : "Registrar retiro"}
          </Button>
          <FormStatus state={state} />
        </form>

        <div className="space-y-2 border-t pt-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold">Retiros de hoy</h3>
            <span className="font-bold tabular-nums">{formatMoney(total)}</span>
          </div>
          {list === null || loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay retiros hoy.</p>
          ) : (
            <ul className="divide-y">
              {list.map((w) => (
                <WithdrawalRow key={w.id} w={w} onVoided={reload} />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawalRow({ w, onVoided }: { w: WithdrawalLine; onVoided: () => void }) {
  const [voiding, setVoiding] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await voidWithdrawalAction(prev, fd);
    if (r.ok) onVoided();
    return r;
  }, initialActionResult);
  return (
    <li className="space-y-1 py-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className={w.voidedAt ? "text-muted-foreground line-through" : ""}>
          <span className="font-medium">{time.format(new Date(w.at))}</span> ·{" "}
          {w.kind === "RELIEF" ? `Alivio · lleva ${w.carriedByName ?? "—"}${w.reason !== "Alivio" ? ` · ${w.reason}` : ""}` : w.reason}
          <span className="block text-xs text-muted-foreground">
            Registró {w.byName ?? "—"}
            {w.depositId && " · ya depositado"}
          </span>
        </div>
        <span className={`font-semibold tabular-nums ${w.voidedAt ? "text-muted-foreground line-through" : ""}`}>
          {formatMoney(w.amountCents)}
        </span>
      </div>
      {w.voidedAt ? (
        <p className="text-xs text-red-700 dark:text-red-400">
          Anulado por {w.voidedByName ?? "—"}: {w.voidReason}
        </p>
      ) : w.depositId ? null : voiding ? (
        <form action={formAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="id" value={w.id} />
          <Input name="reason" placeholder="Motivo de la anulación" aria-label="Motivo de la anulación" className="h-9 flex-1" autoFocus required />
          <Button type="submit" variant="destructive" size="sm" disabled={pending}>
            Anular
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setVoiding(false)}>
            Cancelar
          </Button>
          {!state.ok && <FormStatus state={state} className="w-full" />}
        </form>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => setVoiding(true)}>
          Anular retiro
        </Button>
      )}
    </li>
  );
}
