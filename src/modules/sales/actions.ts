"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { type ActionResult, toActionResult } from "@/core/actions/result";
import { requirePermission } from "@/core/auth/server";
import { setSetting } from "@/core/settings";

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
