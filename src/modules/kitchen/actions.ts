"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, toActionResult } from "@/core/actions/result";
import { requirePermission } from "@/core/auth/server";
import { setSetting } from "@/core/settings";

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
