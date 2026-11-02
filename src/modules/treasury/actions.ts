"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, toActionResult } from "@/core/actions/result";
import { requirePermission } from "@/core/auth/server";
import { DomainError } from "@/core/errors";
import { formatMoney, parseMoney } from "@/core/money";
import { businessDate } from "@/core/time";

import * as withdrawals from "./services/withdrawals";

function refreshCash() {
  revalidatePath("/cierre");
  revalidatePath("/caja-bancos");
}

function moneyOrError(text: string): number {
  try {
    return parseMoney(text);
  } catch {
    throw new DomainError("Monto inválido");
  }
}

export async function createWithdrawalAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("cash.withdraw");
  return toActionResult(async () => {
    const amountCents = moneyOrError(String(fd.get("amount") ?? ""));
    await withdrawals.createWithdrawal({ amountCents, reason: String(fd.get("reason") ?? "") }, session.userId);
    refreshCash();
    return `Retiro de ${formatMoney(amountCents)} registrado`;
  });
}

export async function voidWithdrawalAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("cash.withdraw");
  return toActionResult(async () => {
    await withdrawals.voidWithdrawal(String(fd.get("id") ?? ""), String(fd.get("reason") ?? ""), session.userId);
    refreshCash();
    return "Retiro anulado";
  });
}

/** Retiros de hoy para la ventana de la barra superior. */
export async function todayWithdrawalsAction(): Promise<withdrawals.WithdrawalLine[]> {
  await requirePermission("cash.withdraw");
  return withdrawals.listWithdrawals(businessDate());
}
