"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, toActionResult } from "@/core/actions/result";
import { requirePermission } from "@/core/auth/server";
import { formatQuantity } from "@/core/quantity";

import type { CountInput } from "./schemas";
import * as ops from "./services/operations";

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");

function refresh() {
  revalidatePath("/inventario", "layout");
}

export async function createProductionAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("inventory.receive");
  return toActionResult(async () => {
    const e = await ops.createProduction(
      { productId: text(fd, "productId"), quantity: text(fd, "quantity"), date: text(fd, "date"), unitCost: text(fd, "unitCost"), note: text(fd, "note") },
      session.userId,
    );
    refresh();
    return `Ingreso registrado: +${formatQuantity(e.quantity)} ${e.productName}`;
  });
}

export async function createCountAction(input: CountInput): Promise<ActionResult> {
  const session = await requirePermission("inventory.count");
  return toActionResult(async () => {
    const c = await ops.createCount(input, session.userId);
    refresh();
    const changes = c.lines.filter((l) => !l.difference.isZero()).length;
    return `Conteo guardado: ${c.lines.length} ítems, ${changes} con diferencia`;
  });
}

export async function createConsumptionAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("inventory.consume");
  return toActionResult(async () => {
    const r = await ops.createConsumption({ productId: text(fd, "productId"), quantity: text(fd, "quantity"), reason: text(fd, "reason") }, session.userId);
    refresh();
    return `Salida registrada: ${text(fd, "quantity")} × ${r.name}`;
  });
}
