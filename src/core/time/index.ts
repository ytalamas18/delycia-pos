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
