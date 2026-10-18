import { addDays, businessDate } from "@/core/time";

/** Rango de días de negocio (zona horaria del local), ambos inclusive, "YYYY-MM-DD". */
export type DateRange = { from: string; to: string };

/** Tope para que un rango enorme no ponga lenta la base. */
export const MAX_RANGE_DAYS = 366;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type RangePreset = { key: "hoy" | "ayer" | "7d" | "mes"; label: string; range: DateRange };

/** Atajos. "Hoy" es el día en La Paz, no en UTC (a las 23:30 de La Paz en UTC ya es mañana). */
export function rangePresets(now: Date = new Date()): RangePreset[] {
  const today = businessDate(now);
  return [
    { key: "hoy", label: "Hoy", range: { from: today, to: today } },
    { key: "ayer", label: "Ayer", range: { from: addDays(today, -1), to: addDays(today, -1) } },
    { key: "7d", label: "Últimos 7 días", range: { from: addDays(today, -6), to: today } },
    { key: "mes", label: "Este mes", range: { from: `${today.slice(0, 8)}01`, to: today } },
  ];
}

export function daysBetween(range: DateRange): number {
  const ms = Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * Lee el rango de la URL. Si falta o es inválido, usa "Hoy". Si viene al revés, lo da vuelta.
 * Si pasa del tope, recorta el inicio.
 */
export function parseRange(params: { desde?: string; hasta?: string }, now: Date = new Date()): DateRange {
  const today = businessDate(now);
  const valid = (d?: string) => (d && ISO_DATE.test(d) && !Number.isNaN(Date.parse(d)) ? d : undefined);
  let from = valid(params.desde) ?? valid(params.hasta) ?? today;
  let to = valid(params.hasta) ?? from;
  if (from > to) [from, to] = [to, from];
  if (daysBetween({ from, to }) > MAX_RANGE_DAYS) from = addDays(to, -(MAX_RANGE_DAYS - 1));
  return { from, to };
}

/** Todos los días del rango, en orden (para que el gráfico muestre también los días sin ventas). */
export function eachDay(range: DateRange): string[] {
  const days: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) days.push(d);
  return days;
}
