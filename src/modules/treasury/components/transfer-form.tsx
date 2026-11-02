"use client";

import { useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionResult, type ActionResult } from "@/core/actions/types";
import { formatMoney, parseMoney } from "@/core/money";
import { MONEY_ACCOUNT_LABEL } from "@/core/money/accounts";
import type { MoneyAccount } from "@/generated/prisma/enums";

import { createTransferAction } from "../actions";

const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-base";
const FROM: MoneyAccount[] = ["ATC_PEYA", "CASH", "BANK"];
const TO: MoneyAccount[] = ["BANK", "ATC_PEYA"];

function cents(text: string): number | null {
  try {
    return text.trim() ? parseMoney(text) : null;
  } catch {
    return null;
  }
}

/**
 * Depósito / traspaso entre cuentas. PeYa y ATC depositan ya descontada la comisión: se escribe lo que sale
 * y lo que llega, y la diferencia queda sola como "Comisión".
 */
export function TransferForm({ today }: { today: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [from, setFrom] = useState<MoneyAccount>("ATC_PEYA");
  const [to, setTo] = useState<MoneyAccount>("BANK");
  const [out, setOut] = useState("");
  const [inn, setIn] = useState("");
  const [state, action, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await createTransferAction(prev, fd);
    if (r.ok) {
      ref.current?.reset();
      setFrom("ATC_PEYA");
      setTo("BANK");
      setOut("");
      setIn("");
    }
    return r;
  }, initialActionResult);
  const outCents = cents(out);
  const inCents = inn.trim() ? cents(inn) : outCents;
  const commission = outCents !== null && inCents !== null ? outCents - inCents : null;

  return (
    <form ref={ref} action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label htmlFor="tr-date">Fecha</Label>
          <Input id="tr-date" name="date" type="date" defaultValue={today} max={today} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="tr-from">Sale de</Label>
          <select id="tr-from" name="fromAccount" className={selectClass} value={from} onChange={(e) => setFrom(e.target.value as MoneyAccount)}>
            {FROM.map((a) => (
              <option key={a} value={a}>
                {MONEY_ACCOUNT_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="tr-to">Llega a</Label>
          <select id="tr-to" name="toAccount" className={selectClass} value={to} onChange={(e) => setTo(e.target.value as MoneyAccount)}>
            {TO.map((a) => (
              <option key={a} value={a} disabled={a === from}>
                {MONEY_ACCOUNT_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="tr-out">Monto que sale (Bs)</Label>
          <Input id="tr-out" name="amountOut" inputMode="decimal" value={out} onChange={(e) => setOut(e.target.value)} required />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="tr-in">Monto que llega (Bs)</Label>
          <Input id="tr-in" name="amountIn" inputMode="decimal" placeholder="Igual al que sale" value={inn} onChange={(e) => setIn(e.target.value)} />
        </div>
        <div className="grid gap-1">
          <span className="text-sm font-medium">Comisión</span>
          <span className={`flex h-11 items-center text-lg font-semibold tabular-nums ${commission !== null && commission < 0 ? "text-red-700 dark:text-red-400" : ""}`}>
            {commission === null ? "—" : commission < 0 ? "Llega más de lo que sale" : formatMoney(commission)}
          </span>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="tr-ref">N° de comprobante / referencia</Label>
          <Input id="tr-ref" name="reference" maxLength={60} placeholder="Opcional" />
        </div>
        <div className="grid gap-1 sm:col-span-2">
          <Label htmlFor="tr-note">Nota</Label>
          <Input id="tr-note" name="note" maxLength={200} placeholder="Opcional (ej. liquidación PeYa semana 44)" />
        </div>
      </div>
      {from === "CASH" && (
        <p className="text-sm text-muted-foreground">Sale de la caja de hoy: resta del efectivo esperado en el cierre de caja.</p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Registrar traspaso"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
