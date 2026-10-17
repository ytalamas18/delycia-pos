"use server";

import { type ActionResult, toActionResult } from "@/core/actions/result";
import { requirePermission } from "@/core/auth/server";
import { changeUserPin } from "@/core/auth/service";

export async function changePinAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("settings.manage");
  return toActionResult(async () => {
    const name = await changeUserPin({
      adminId: session.userId,
      adminPin: String(fd.get("adminPin") ?? ""),
      userId: String(fd.get("userId") ?? ""),
      newPin: String(fd.get("newPin") ?? ""),
      confirmPin: String(fd.get("confirmPin") ?? ""),
    });
    return `PIN de ${name} cambiado`;
  });
}
