import { appConfig } from "@/core/config/app";

/**
 * Día de negocio en la zona horaria del local, como "YYYY-MM-DD".
 * Una venta a las 23:30 en La Paz es de ese día aunque en UTC ya sea mañana.
 */
export function businessDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: appConfig.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Desfase de la zona horaria del local en un instante dado, en minutos (La Paz: -240). */
function offsetMinutes(at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: appConfig.timezone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value; // "GMT-04:00"
  const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

/** Inicio y fin (exclusivo) de un día de negocio "YYYY-MM-DD", como instantes UTC. */
export function businessDayRange(date: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Fecha inválida: ${date}`);
  const utcMidnight = new Date(`${date}T00:00:00Z`);
  const start = new Date(utcMidnight.getTime() - offsetMinutes(utcMidnight) * 60_000);
  const end = new Date(start.getTime() + 24 * 3600_000);
  return { start, end };
}

/** Suma (o resta) días a una fecha "YYYY-MM-DD". */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
