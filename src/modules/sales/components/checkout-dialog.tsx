"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, formatMoneyInput, parseMoney } from "@/core/money";
import type { PaymentMethod, SalesChannel } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

import { payOrderAction } from "../actions";
import { allowedPaymentMethods, discountCents, settle, type PaymentEntry } from "../domain/checkout";
import { paymentMethodLabel } from "../domain/labels";


/** Texto → centavos; vacío o inválido = 0 (el formulario lo marca). */
function cents(text: string): number {
  if (!text.trim()) return 0;
  try {
    return parseMoney(text);
  } catch {
    return 0;
  }
}


type Line = { method: PaymentMethod; text: string };

export function CheckoutDialog({
  order,
  onClose,
  onPaid,
}: {
  order: { id: string; number: number; subtotalCents: number; channel: SalesChannel; customerName: string | null };
  onClose: () => void;
  onPaid: () => void;
}) {
  const methods = allowedPaymentMethods(order.channel);
  const [discountType, setDiscountType] = useState<"AMOUNT" | "PERCENT">("AMOUNT");
  const [discountText, setDiscountText] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { method: order.channel === "PEYA" ? "PEYA" : "CASH", text: order.channel === "PEYA" ? formatMoneyInput(order.subtotalCents) : "" },
  ]);
  const [customerName, setCustomerName] = useState(order.customerName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const discountValue = discountType === "PERCENT" ? Number(discountText.replace(",", ".")) || 0 : cents(discountText);
  const discount = discountCents(order.subtotalCents, { type: discountType, value: discountValue });
  const total = order.subtotalCents - discount;
  const entries: PaymentEntry[] = lines.map((l) => ({ method: l.method, amountCents: cents(l.text) }));
  const preview = settle(total, entries);
  const otherPaid = entries.filter((e) => e.method !== "CASH").reduce((s, e) => s + e.amountCents, 0);
  const hasCredit = lines.some((l) => l.method === "CREDIT" && cents(l.text) > 0);

  function addMethod(method: PaymentMethod) {
    setError(null);
    setLines((ls) => {
      if (ls.some((l) => l.method === method)) return ls;
      // El método nuevo propone lo que falta (sin contar el efectivo).
      const missing = Math.max(0, total - ls.filter((l) => l.method !== "CASH").reduce((s, l) => s + cents(l.text), 0));
      const cleared = ls.filter((l) => cents(l.text) > 0 || l.method === "CASH");
      return [...cleared, { method, text: method === "CASH" ? "" : formatMoneyInput(missing) }];
    });
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await payOrderAction(order.id, {
        discount: discount > 0 ? { type: discountType, value: discountValue } : null,
        entries,
        customerName: customerName.trim() || null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onPaid();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogTitle>Cobrar orden #{order.number}</DialogTitle>
        <DialogDescription className="sr-only">Descuento y forma de pago</DialogDescription>

        <div className="space-y-1 rounded-lg bg-muted p-3">
          <Row label="Subtotal" value={formatMoney(order.subtotalCents)} />
          {discount > 0 && <Row label="Descuento" value={`− ${formatMoney(discount)}`} />}
          <Row label="Total a cobrar" value={formatMoney(total)} strong />
        </div>

        <div className="space-y-2">
          <Label htmlFor="discount">Descuento (opcional)</Label>
          <div className="flex gap-2">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(["AMOUNT", "PERCENT"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={discountType === t}
                  onClick={() => setDiscountType(t)}
                  className={cn("h-10 w-14 rounded-md font-semibold", discountType === t && "bg-background shadow-sm")}
                >
                  {t === "AMOUNT" ? "Bs" : "%"}
                </button>
              ))}
            </div>
            <Input
              id="discount"
              inputMode="decimal"
              value={discountText}
              placeholder="0"
              onChange={(e) => setDiscountText(e.target.value)}
              className="w-32"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>
            {order.channel === "PEYA" ? "Forma de pago (orden PEYA: solo PEYA)" : "Forma de pago (se puede combinar)"}
          </Label>
          <div className="flex flex-wrap gap-2">
            {methods.map((m) => {
              const on = lines.some((l) => l.method === m);
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={on}
                  onClick={() => addMethod(m)}
                  className={cn(
                    "h-12 rounded-lg border px-4 text-base font-semibold",
                    on ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                  )}
                >
                  {paymentMethodLabel[m]}
                </button>
              );
            })}
          </div>

          <ul className="space-y-2">
            {lines.map((l, index) => {
              const isCash = l.method === "CASH";
              const cashDue = Math.max(0, total - otherPaid);
              return (
                <li key={l.method} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <span className="w-44 font-semibold">
                      {paymentMethodLabel[l.method]}
                      {isCash && <span className="block text-sm font-normal text-muted-foreground">Recibido</span>}
                    </span>
                    <Input
                      inputMode="decimal"
                      aria-label={`Monto ${paymentMethodLabel[l.method]}`}
                      value={l.text}
                      placeholder={isCash ? formatMoneyInput(cashDue) : "0"}
                      onChange={(e) =>
                        setLines((ls) => ls.map((x, i) => (i === index ? { ...x, text: e.target.value } : x)))
                      }
                      className="text-lg"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar ${paymentMethodLabel[l.method]}`}
                      onClick={() => setLines((ls) => ls.filter((_, i) => i !== index))}
                    >
                      <X />
                    </Button>
                  </div>
                  {isCash && cashDue > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {[cashDue, 5000, 10000, 20000]
                        .filter((v, i, all) => (i === 0 || v > cashDue) && all.indexOf(v) === i)
                        .map((v, i) => (
                          <Button
                            key={v}
                            variant="secondary"
                            size="sm"
                            className="h-10"
                            onClick={() =>
                              setLines((ls) => ls.map((x, j) => (j === index ? { ...x, text: formatMoneyInput(v) } : x)))
                            }
                          >
                            {i === 0 ? "Exacto" : formatMoney(v)}
                          </Button>
                        ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {hasCredit && (
          <div className="space-y-2">
            <Label htmlFor="debtor">Cliente (cuenta por cobrar)</Label>
            <Input
              id="debtor"
              value={customerName}
              placeholder="¿A nombre de quién?"
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
        )}

        <div className="rounded-lg border-2 p-3 text-lg">
          {preview.ok ? (
            preview.changeCents > 0 ? (
              <Row label="Vuelto" value={formatMoney(preview.changeCents)} strong />
            ) : (
              <span className="font-semibold text-green-700 dark:text-green-400">✔ Total cubierto</span>
            )
          ) : (
            <span className="font-semibold text-destructive">
              {preview.missingCents ? `Falta: ${formatMoney(preview.missingCents)}` : preview.error}
            </span>
          )}
        </div>

        {error && (
          <p className="font-medium text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button
          size="lg"
          className="h-16 text-xl"
          disabled={pending || !preview.ok || (hasCredit && !customerName.trim())}
          onClick={confirm}
        >
          {pending ? "Cobrando…" : `Cobrar ${formatMoney(total)}`}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between", strong && "text-xl font-bold")}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
