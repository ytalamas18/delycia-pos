import type { TicketStatus } from "@/generated/prisma/enums";

/** Flujo normal de una comanda. ANULADA queda fuera del flujo. */
const FLOW: TicketStatus[] = ["PENDING", "IN_PROGRESS", "READY", "DELIVERED"];

export function nextStatus(status: TicketStatus): TicketStatus | null {
  const i = FLOW.indexOf(status);
  return i === -1 || i === FLOW.length - 1 ? null : FLOW[i + 1];
}

/** Para "deshacer" un toque por error: vuelve un paso atrás. */
export function previousStatus(status: TicketStatus): TicketStatus | null {
  const i = FLOW.indexOf(status);
  return i <= 0 ? null : FLOW[i - 1];
}

/** Hora que se guarda al ENTRAR a cada estado (y que se limpia al deshacerlo). */
export const statusTimestamp = {
  IN_PROGRESS: "startedAt",
  READY: "readyAt",
  DELIVERED: "deliveredAt",
  CANCELLED: "cancelledAt",
} as const satisfies Partial<Record<TicketStatus, string>>;

/** Texto del botón principal de la tarjeta según el estado actual. */
export const advanceLabel: Partial<Record<TicketStatus, string>> = {
  PENDING: "Empezar",
  IN_PROGRESS: "Marcar lista",
  READY: "Entregada",
};

export type WaitLevel = "ok" | "warn" | "danger";

export function waitLevel(minutes: number, thresholds: { warnAfterMinutes: number; dangerAfterMinutes: number }): WaitLevel {
  if (minutes >= thresholds.dangerAfterMinutes) return "danger";
  if (minutes >= thresholds.warnAfterMinutes) return "warn";
  return "ok";
}
