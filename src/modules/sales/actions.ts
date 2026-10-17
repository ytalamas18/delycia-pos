"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, toActionResult } from "@/core/actions/result";
import { requirePermission } from "@/core/auth/server";
import { setSetting } from "@/core/settings";

import type { DraftLineInput, ItemUpdateInput, OrderHeaderInput } from "./schemas";
import * as orders from "./services/orders";
import { peyaMarkupSetting } from "./settings";

export async function savePeyaMarkupAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePermission("settings.manage");
  return toActionResult(async () => {
    const percent = z.coerce
      .number({ message: "Ingresa un número" })
      .min(0, "No puede ser negativo")
      .max(300, "Máximo 300 %")
      .parse(String(fd.get("percent") ?? "").replace(",", "."));
    await setSetting(peyaMarkupSetting, percent);
    revalidatePath("/ajustes");
    return `Recargo PEYA guardado: ${percent} %`;
  });
}

// ---------------------------------------------------------------------------
// Órdenes (pantalla de venta)
// ---------------------------------------------------------------------------


function refreshSales() {
  revalidatePath("/pos");
  revalidatePath("/ordenes");
}

export async function createOrderAction(
  header: OrderHeaderInput,
  lines: DraftLineInput[],
): Promise<ActionResult & { orderId?: string; number?: number }> {
  const session = await requirePermission("sales.sell");
  const out: { order?: { id: string; number: number } } = {};
  const result = await toActionResult(async () => {
    out.order = await orders.createOrder(header, lines, session.userId);
    refreshSales();
    return `Orden #${out.order.number} guardada`;
  });
  return out.order ? { ...result, orderId: out.order.id, number: out.order.number } : result;
}

export async function saveOrderChangesAction(
  orderId: string,
  info: Pick<OrderHeaderInput, "serviceType" | "tableNumber" | "customerName">,
  lines: DraftLineInput[],
): Promise<ActionResult> {
  await requirePermission("sales.sell");
  return toActionResult(async () => {
    await orders.updateOrderInfo(orderId, info);
    if (lines.length > 0) await orders.addItems(orderId, lines);
    refreshSales();
    return lines.length > 0 ? "Ítems agregados a la orden" : "Orden actualizada";
  });
}

export async function updateItemAction(orderId: string, itemId: string, input: ItemUpdateInput): Promise<ActionResult> {
  await requirePermission("sales.sell");
  return toActionResult(async () => {
    await orders.updateItem(orderId, itemId, input);
    refreshSales();
  });
}

export async function removeItemAction(orderId: string, itemId: string): Promise<ActionResult> {
  await requirePermission("sales.sell");
  return toActionResult(async () => {
    await orders.removeItem(orderId, itemId);
    refreshSales();
  });
}
