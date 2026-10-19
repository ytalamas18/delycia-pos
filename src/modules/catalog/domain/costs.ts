import { appConfig } from "@/core/config/app";
import { formatMoney } from "@/core/money";
import { Decimal, type DecimalValue } from "@/core/quantity";

/** Decimales (en Bs) que admite un costo unitario: 1 g de sal puede costar Bs 0,0045. */
export const UNIT_COST_DECIMALS = 4;

/** "0,045" (Bs por unidad base) → centavos en Decimal (4,5). */
export function parseUnitCost(input: string): Decimal {
  const clean = input.trim().replace(/\s/g, "").replace(/^Bs/i, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(clean)) throw new Error(`Costo inválido: "${input}"`);
  const bs = new Decimal(clean);
  if (bs.decimalPlaces() > UNIT_COST_DECIMALS) throw new Error(`Máximo ${UNIT_COST_DECIMALS} decimales`);
  return bs.mul(100);
}

/** Centavos (Decimal) → "Bs 0,045". Con 2 decimales si alcanza, hasta 4 si hace falta. */
export function formatUnitCost(cents: DecimalValue): string {
  const { locale, symbol } = appConfig.currency;
  const bs = new Decimal(cents).div(100).toDecimalPlaces(UNIT_COST_DECIMALS, Decimal.ROUND_HALF_UP).toNumber();
  const amount = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: UNIT_COST_DECIMALS }).format(bs);
  return `${symbol} ${amount}`;
}

/** Centavos (Decimal) → texto editable en Bs: 4,5 → "0,045". */
export function formatUnitCostInput(cents: DecimalValue): string {
  return new Decimal(cents).div(100).toDecimalPlaces(UNIT_COST_DECIMALS).toString().replace(".", ",");
}

/** Costo total (centavos con decimales) → "Bs 8,25", redondeado al centavo. */
export function formatCost(cents: DecimalValue): string {
  return formatMoney(new Decimal(cents).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber());
}
