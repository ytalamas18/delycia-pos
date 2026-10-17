"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, toActionResult } from "@/core/actions/result";
import { requirePermission } from "@/core/auth/server";
import { setSetting } from "@/core/settings";

import * as messages from "./services/messages";
import * as tickets from "./services/tickets";
import { kdsThresholdsSetting, quickMessagesSetting } from "./settings";

export async function saveKdsThresholdsAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePermission("settings.manage");
  return toActionResult(async () => {
    await setSetting(kdsThresholdsSetting, {
      warnAfterMinutes: Number(fd.get("warnAfterMinutes")),
      dangerAfterMinutes: Number(fd.get("dangerAfterMinutes")),
    });
    revalidatePath("/ajustes");
    revalidatePath("/cocina");
    return "Tiempos de cocina guardados";
  });
}

// Las pantallas de cocina se actualizan solas por tiempo real: estas acciones no necesitan revalidar rutas.

export async function advanceTicketAction(ticketId: string): Promise<ActionResult> {
  const session = await requirePermission("kitchen.operate");
  return toActionResult(async () => {
    await tickets.advanceTicket(ticketId, session.userId);
  });
}

export async function undoTicketAction(ticketId: string): Promise<ActionResult> {
  const session = await requirePermission("kitchen.operate");
  return toActionResult(async () => {
    await tickets.undoTicket(ticketId, session.userId);
  });
}

export async function toggleItemReadyAction(itemId: string): Promise<ActionResult> {
  const session = await requirePermission("kitchen.operate");
  return toActionResult(async () => {
    await tickets.toggleItemReady(itemId, session.userId);
  });
}

// --- Mensajes de caja a cocina ---

export async function sendKitchenMessageAction(text: string): Promise<ActionResult> {
  const session = await requirePermission("sales.sell");
  return toActionResult(async () => {
    const m = await messages.sendKitchenMessage(text, { userId: session.userId, name: session.name });
    return `Enviado a cocina: ${m.text}`;
  });
}

export async function acknowledgeKitchenMessageAction(messageId: string): Promise<ActionResult> {
  const session = await requirePermission("kitchen.operate");
  return toActionResult(async () => {
    await messages.acknowledgeKitchenMessage(messageId, { userId: session.userId, name: session.name });
  });
}

export async function saveQuickMessagesAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePermission("settings.manage");
  return toActionResult(async () => {
    const list = String(fd.get("messages") ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    await setSetting(quickMessagesSetting, list);
    revalidatePath("/ajustes");
    revalidatePath("/pos");
    return "Mensajes rápidos guardados";
  });
}
