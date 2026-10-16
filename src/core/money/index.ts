import { appConfig } from "@/core/config/app";

/**
 * Los montos SIEMPRE se manejan como enteros en la unidad mínima de la moneda
 * (centavos con 2 decimales). Nunca usar float para dinero.
 */
export type Cents = number;

const factor = 10 ** appConfig.currency.decimals;

export function assertCents(value: number): Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Monto inválido (debe ser entero en centavos): ${value}`);
  }
  return value;
}

/** Convierte un texto ingresado por el usuario ("38", "38,5", "1.234,50") a centavos. */
export function parseMoney(input: string): Cents {
  const clean = input.trim().replace(/\s/g, "").replace(appConfig.currency.symbol, "");
  if (!/^\d+([.,]\d+)*$/.test(clean)) {
    throw new Error(`Monto inválido: "${input}"`);
  }
  // El último separador (si tiene 1 o 2 dígitos detrás) es el decimal; el resto son miles.
  const match = clean.match(/^(.*?)(?:[.,](\d{1,2}))?$/)!;
  const integerPart = match[1].replace(/[.,]/g, "");
  const decimalPart = (match[2] ?? "").padEnd(appConfig.currency.decimals, "0");
  return assertCents(Number(integerPart) * factor + Number(decimalPart || 0));
}

/** Formatea centavos para mostrar: 3800 → "Bs 38,00". */
export function formatMoney(cents: Cents): string {
  const { locale, decimals, symbol, symbolPosition } = appConfig.currency;
  const amount = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(cents / factor);
  return symbolPosition === "before" ? `${symbol} ${amount}` : `${amount} ${symbol}`;
}

/**
 * Porcentaje de un monto, redondeado al centavo (half-up).
 * `percent` admite hasta 2 decimales (ej. 12.5 = 12,5 %).
 */
export function percentOf(cents: Cents, percent: number): Cents {
  const basisPoints = Math.round(percent * 100); // 12.5 % → 1250
  return assertCents(Math.round((cents * basisPoints) / 10_000));
}
