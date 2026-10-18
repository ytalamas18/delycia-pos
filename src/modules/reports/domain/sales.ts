import type { Cents } from "@/core/money";

import { eachDay, type DateRange } from "./range";

/**
 * Canal de venta = medio de pago. Las claves salen de los datos: si mañana se agrega
 * un medio nuevo (ej. DELIVERY), aparece solo; `CHANNEL_ORDER` solo fija el orden de las columnas.
 */
export const CHANNEL_ORDER = ["CASH", "QR", "CARD", "PEYA", "CREDIT"];

/** Fila agregada por la base: un día × un canal. */
export type ChannelDayRow = { day: string; channel: string; orders: number; totalCents: Cents };
/** Fila agregada por la base: totales de un día (órdenes distintas). */
export type DayRow = { day: string; orders: number; totalCents: Cents };

export type Cell = { orders: number; totalCents: Cents; averageCents: Cents };

export type SalesByChannelReport = {
  channels: string[];
  days: { day: string; byChannel: Record<string, Cell>; total: Cell; cancelled: { orders: number; totalCents: Cents } }[];
  totals: { byChannel: Record<string, Cell>; total: Cell; cancelled: Cell };
};

export const average = (totalCents: Cents, orders: number): Cents => (orders > 0 ? Math.round(totalCents / orders) : 0);
const cell = (orders: number, totalCents: Cents): Cell => ({ orders, totalCents, averageCents: average(totalCents, orders) });

function sumCells(cells: { orders: number; totalCents: Cents }[]): Cell {
  return cell(
    cells.reduce((s, c) => s + c.orders, 0),
    cells.reduce((s, c) => s + c.totalCents, 0),
  );
}

export function orderChannels(present: string[]): string[] {
  const rank = (c: string) => (CHANNEL_ORDER.includes(c) ? CHANNEL_ORDER.indexOf(c) : CHANNEL_ORDER.length);
  return [...new Set([...CHANNEL_ORDER, ...present])].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * Arma el reporte a partir de lo que ya sumó la base.
 * Una orden pagada con dos medios cuenta en ambos canales, pero UNA sola vez en el total del día.
 */
export function buildSalesByChannel(
  range: DateRange,
  input: { byChannel: ChannelDayRow[]; byDay: DayRow[]; cancelledByDay: DayRow[] },
): SalesByChannelReport {
  const channels = orderChannels(input.byChannel.map((r) => r.channel));
  const days = eachDay(range).map((day) => {
    const byChannel: Record<string, Cell> = {};
    for (const c of channels) {
      const row = input.byChannel.find((r) => r.day === day && r.channel === c);
      byChannel[c] = cell(row?.orders ?? 0, row?.totalCents ?? 0);
    }
    const d = input.byDay.find((r) => r.day === day);
    const x = input.cancelledByDay.find((r) => r.day === day);
    return {
      day,
      byChannel,
      total: cell(d?.orders ?? 0, d?.totalCents ?? 0),
      cancelled: { orders: x?.orders ?? 0, totalCents: x?.totalCents ?? 0 },
    };
  });

  const byChannel: Record<string, Cell> = {};
  for (const c of channels) byChannel[c] = sumCells(days.map((d) => d.byChannel[c]));

  return {
    channels,
    days,
    totals: {
      byChannel,
      total: sumCells(days.map((d) => d.total)),
      cancelled: sumCells(days.map((d) => d.cancelled)),
    },
  };
}
