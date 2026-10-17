"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionResult } from "@/core/actions/types";
import { formatMoney, formatMoneyInput, parseMoney } from "@/core/money";
import { cn } from "@/lib/utils";

import { saveClosingAction } from "../actions";

function cents(text: string) {
  try {
    return text.trim() ? parseMoney(text) : 0;
  } catch {
    return 0;
  }
}

type Saved = {
  openingCashCents: number;
  countedCashCents: number;
  countedQrCents: number | null;
  countedCardCents: number | null;
  notes: string | null;
};

/**
 * Arqueo: efectivo (fondo + contado), QR (lo que muestra la app del banco) y tarjeta (reporte del datáfono).
 * PEYA y cuentas por cobrar no se cuentan: no es dinero que esté en el local.
 */
export function ClosingForm({
  date,
  moneyIn,
  saved,
}: {
  date: string;
  /** Lo que el sistema registró que entró hoy por cada medio (ventas + cobros de fiados). */
  moneyIn: { cash: number; qr: number; card: number };
  saved: Saved | null;
}) {
  const initial = (v: number | null | undefined) => (v === null || v === undefined ? "" : formatMoneyInput(v));
  const [opening, setOpening] = useState(initial(saved?.openingCashCents));
  const [cash, setCash] = useState(initial(saved?.countedCashCents));
  const [qr, setQr] = useState(initial(saved?.countedQrCents));
  const [card, setCard] = useState(initial(saved?.countedCardCents));
  const [state, action, pending] = useActionState(saveClosingAction, initialActionResult);

  const rows = [
    { key: "cash", label: "Efectivo", name: "counted", value: cash, set: setCash, expected: cents(opening) + moneyIn.cash, hint: "Contado en caja", required: true },
    { key: "qr", label: "QR", name: "countedQr", value: qr, set: setQr, expected: moneyIn.qr, hint: "Según la app del banco" },
    { key: "card", label: "Tarjeta", name: "countedCard", value: card, set: setCard, expected: moneyIn.card, hint: "Según el datáfono" },
  ];

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="fecha" value={date} />
      <div className="max-w-xs space-y-2">
        <Label htmlFor="opening">Fondo inicial de caja (Bs)</Label>
        <Input id="opening" name="opening" inputMode="decimal" placeholder="0" value={opening} onChange={(e) => setOpening(e.target.value)} />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="text-left text-sm text-muted-foreground">
            <tr>
              <th className="py-1">Medio</th>
              <th className="text-right">Sistema</th>
              <th className="px-3">Contado / revisado</th>
              <th className="text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const filled = r.value.trim() !== "";
              const diff = cents(r.value) - r.expected;
              return (
                <tr key={r.key} className="border-t">
                  <td className="py-2 font-medium">
                    {r.label}
                    <span className="block text-xs font-normal text-muted-foreground">{r.hint}</span>
                  </td>
                  <td className="text-right tabular-nums">{formatMoney(r.expected)}</td>
                  <td className="px-3">
                    <Input
                      name={r.name}
                      inputMode="decimal"
                      aria-label={`${r.label} contado`}
                      placeholder={r.required ? "" : "opcional"}
                      required={r.required}
                      value={r.value}
                      onChange={(e) => r.set(e.target.value)}
                      className="min-w-28"
                    />
                  </td>
                  <td
                    className={cn(
                      "text-right font-semibold whitespace-nowrap tabular-nums",
                      !filled ? "text-muted-foreground" : diff === 0 ? "text-green-700" : diff < 0 ? "text-destructive" : "text-blue-700",
                    )}
                  >
                    {!filled ? "—" : diff === 0 ? "Cuadra ✔" : `${diff < 0 ? "Falta" : "Sobra"} ${formatMoney(Math.abs(diff))}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">
        El efectivo del sistema incluye el fondo inicial. PEYA y cuentas por cobrar no se cuentan en el arqueo.
      </p>

      <div className="space-y-2">
        <Label htmlFor="notes">Observaciones (opcional)</Label>
        <Input id="notes" name="notes" defaultValue={saved?.notes ?? ""} placeholder="Ej. se pagó el gas con caja" />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending || cash.trim() === ""}>
          {saved ? "Actualizar cierre" : "Guardar cierre"}
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
