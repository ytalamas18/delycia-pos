import { type Cents, percentOf } from "@/core/money";
import type { DiscountType, PaymentMethod } from "@/generated/prisma/enums";

export type DiscountInput = { type: DiscountType; value: number } | null;

/**
 * Descuento en centavos.
 * - AMOUNT: `value` en centavos. PERCENT: `value` en % (hasta 2 decimales).
 * - Nunca negativo ni mayor que el subtotal.
 */
export function discountCents(subtotal: Cents, discount: DiscountInput): Cents {
  if (!discount || discount.value <= 0) return 0;
  const raw = discount.type === "PERCENT" ? percentOf(subtotal, Math.min(discount.value, 100)) : discount.value;
  return Math.min(Math.round(raw), subtotal);
}

/** Lo que el cajero cargó por cada método. En efectivo, `amountCents` es lo que ENTREGÓ el cliente. */
export type PaymentEntry = { method: PaymentMethod; amountCents: Cents };

export type SettledPayment = {
  method: PaymentMethod;
  /** Lo que se aplica a la cuenta. */
  amountCents: Cents;
  tenderedCents: Cents | null;
  changeCents: Cents | null;
};

export type Settlement =
  | { ok: true; payments: SettledPayment[]; changeCents: Cents }
  | { ok: false; error: string; missingCents?: Cents };

/**
 * Reparte el total entre los métodos de pago.
 *
 * Reglas:
 * - Los métodos que no son efectivo se aplican tal cual y no pueden pasarse del total
 *   (no se da vuelto de un QR ni de una tarjeta).
 * - El efectivo cubre lo que falta; si el cliente entrega de más, la diferencia es el vuelto.
 * - Lo pagado debe cubrir el total exacto.
 */
export function settle(totalCents: Cents, entries: PaymentEntry[]): Settlement {
  const valid = entries.filter((e) => e.amountCents > 0);
  if (valid.length === 0) return { ok: false, error: "Agrega al menos un pago.", missingCents: totalCents };
  if (valid.some((e) => !Number.isSafeInteger(e.amountCents))) return { ok: false, error: "Monto inválido." };

  const cash = valid.filter((e) => e.method === "CASH");
  const others = valid.filter((e) => e.method !== "CASH");
  const othersTotal = others.reduce((s, e) => s + e.amountCents, 0);

  if (othersTotal > totalCents) {
    return { ok: false, error: "QR, tarjeta, PEYA o cuenta por cobrar no pueden superar el total (no dan vuelto)." };
  }

  const remaining = totalCents - othersTotal;
  const tendered = cash.reduce((s, e) => s + e.amountCents, 0);
  if (tendered < remaining) {
    return { ok: false, error: "Falta cobrar.", missingCents: remaining - tendered };
  }
  if (remaining === 0 && tendered > 0) {
    return { ok: false, error: "El total ya está cubierto: quita el efectivo." };
  }

  const payments: SettledPayment[] = others.map((e) => ({
    method: e.method,
    amountCents: e.amountCents,
    tenderedCents: null,
    changeCents: null,
  }));
  const changeCents = tendered - remaining;
  if (tendered > 0) {
    payments.push({ method: "CASH", amountCents: remaining, tenderedCents: tendered, changeCents });
  }
  return { ok: true, payments, changeCents };
}
