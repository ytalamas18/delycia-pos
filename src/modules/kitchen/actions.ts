"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, toActionResult } from "@/core/actions/result";
import { requirePermission } from "@/core/auth/server";
import { setSetting } from "@/core/settings";

import * as tickets from "./services/tickets";
import { kdsThresholdsSetting } from "./settings";

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
