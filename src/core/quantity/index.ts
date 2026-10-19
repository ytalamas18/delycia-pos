import { Prisma } from "@/generated/prisma/client";

/**
 * Cantidades (stock, recetas, compras) en Decimal: hay kg y gramos, nunca float.
 * Se guardan con 3 decimales (`Decimal(12, 3)`).
 */
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;
export type DecimalValue = string | number | Prisma.Decimal;

export const QUANTITY_DECIMALS = 3;

/** Texto del usuario ("1,5", "250", "0.75") → Decimal. Rechaza más de 3 decimales y separadores de miles. */
export function parseQuantity(input: string): Decimal {
  const clean = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(clean)) throw new Error(`Cantidad inválida: "${input}"`);
  const value = new Decimal(clean);
  if (value.decimalPlaces() > QUANTITY_DECIMALS) throw new Error(`Máximo ${QUANTITY_DECIMALS} decimales: "${input}"`);
  return value;
}

/** Redondea a 3 decimales (half-up), como se guarda en la base. */
export function roundQuantity(value: DecimalValue): Decimal {
  return new Decimal(value).toDecimalPlaces(QUANTITY_DECIMALS, Decimal.ROUND_HALF_UP);
}

/** Decimal → texto para mostrar o editar, sin ceros de más: 1.500 → "1,5". */
export function formatQuantity(value: DecimalValue): string {
  return roundQuantity(value).toString().replace(".", ",");
}
