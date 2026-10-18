import { appConfig } from "../config/app";
import { formatMoney } from "../money";

import type { ColumnType, ExportCell } from "./types";

const dateTimeFmt = new Intl.DateTimeFormat("es-BO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: appConfig.timezone,
});

/** "2026-10-18" → "18/10/2026" */
export function formatDay(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

/** "Del 01/10/2026 al 18/10/2026" o "18/10/2026" si es un solo día. */
export function formatPeriod(from: string, to: string): string {
  return from === to ? formatDay(from) : `Del ${formatDay(from)} al ${formatDay(to)}`;
}

/** Nombre de archivo: "reporte_desde_hasta" (o solo "reporte_dia"). */
export function fileBaseFor(slug: string, from: string, to: string = from): string {
  return from === to ? `${slug}_${from}` : `${slug}_${from}_${to}`;
}

export function formatDateTime(at: Date): string {
  return dateTimeFmt.format(at).replace(",", "");
}

/** Texto de una celda para el PDF. */
export function cellText(value: ExportCell, type: ColumnType): string {
  if (value === null || value === "") return "";
  switch (type) {
    case "money":
      return typeof value === "number" ? formatMoney(value) : String(value);
    case "int":
      return typeof value === "number" ? value.toLocaleString("es-BO") : String(value);
    case "percent":
      return typeof value === "number" ? `${Math.round(value * 100)} %` : String(value);
    case "date":
      return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDay(value) : String(value);
    case "datetime":
      return value instanceof Date ? formatDateTime(value) : String(value);
    default:
      return value instanceof Date ? formatDateTime(value) : String(value);
  }
}

/**
 * Excel no tiene zona horaria: guarda "la hora que se lee". Convertimos el instante a la hora
 * de La Paz y la escribimos como si fuera UTC, para que 14:05 en el local se vea 14:05.
 */
export function wallClock(at: Date): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: appConfig.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second));
}

/** "2026-10-18" → fecha de Excel (medianoche, sin zona). */
export function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}
