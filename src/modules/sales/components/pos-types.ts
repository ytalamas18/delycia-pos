import type { SalesChannel, ServiceType } from "@/generated/prisma/enums";

/** Datos serializables que la página le pasa a la pantalla de venta (cliente). */

export type PosModifier = { id: string; name: string; priceDeltaCents: number };

export type PosProduct = {
  id: string;
  categoryId: string;
  name: string;
  priceCents: number;
  sendsToKitchen: boolean;
  modifiers: PosModifier[];
};

export type PosCategory = { id: string; name: string };

export type PosSavedItem = {
  id: string;
  productName: string;
  unitPriceCents: number;
  quantity: number;
  note: string | null;
  serviceType: ServiceType;
  modifiers: string[];
  sentToKitchen: boolean;
};

export type PosOrder = {
  id: string;
  number: number;
  channel: SalesChannel;
  serviceType: ServiceType;
  tableNumber: string | null;
  customerName: string | null;
  markupPercent: number;
  items: PosSavedItem[];
};
