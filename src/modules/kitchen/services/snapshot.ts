import { getSetting } from "@/core/settings";
import type { ServiceType, TicketStatus } from "@/generated/prisma/enums";

import { kdsThresholdsSetting } from "../settings";
import { listActiveTickets, listRecentTickets, type TicketWithItems } from "./tickets";

/** Lo que la pantalla de cocina necesita para dibujarse. Es la "fuente de verdad" tras cada evento. */
export type KdsTicket = {
  id: string;
  orderNumber: number;
  sequence: number;
  channel: "LOCAL" | "PEYA";
  serviceType: ServiceType;
  label: string;
  status: TicketStatus;
  receivedAt: string;
  updatedAt: string;
  items: {
    id: string;
    name: string;
    quantity: number;
    modifiers: string[];
    note: string | null;
    serviceType: ServiceType;
    ready: boolean;
    voided: boolean;
  }[];
};

export type KdsSnapshot = {
  active: KdsTicket[];
  recent: KdsTicket[];
  thresholds: { warnAfterMinutes: number; dangerAfterMinutes: number };
  serverNow: string;
};

function toKdsTicket(t: TicketWithItems): KdsTicket {
  return {
    id: t.id,
    orderNumber: t.orderNumber,
    sequence: t.sequence,
    channel: t.channel,
    serviceType: t.serviceType,
    label: t.label,
    status: t.status,
    receivedAt: t.receivedAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    items: t.items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      modifiers: i.modifiers as string[],
      note: i.note,
      serviceType: i.serviceType,
      ready: i.readyAt !== null,
      voided: i.voidedAt !== null,
    })),
  };
}

export async function getKdsSnapshot(): Promise<KdsSnapshot> {
  const [active, recent, thresholds] = await Promise.all([
    listActiveTickets(),
    listRecentTickets(),
    getSetting(kdsThresholdsSetting),
  ]);
  return {
    active: active.map(toKdsTicket),
    recent: recent.map(toKdsTicket),
    thresholds,
    serverNow: new Date().toISOString(),
  };
}
