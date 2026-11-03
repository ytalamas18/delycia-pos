"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, toActionResult } from "@/core/actions/result";
import { requirePermission } from "@/core/auth/server";
import { DomainError } from "@/core/errors";
import { formatMoney, parseMoney } from "@/core/money";
import { businessDate } from "@/core/time";

import * as accounts from "./services/accounts";
import * as deposits from "./services/deposits";
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
    const kind = fd.get("kind") === "RELIEF" ? "RELIEF" : "OWNER";
    await withdrawals.createWithdrawal(
      {
        amountCents,
        reason: String(fd.get("reason") ?? ""),
        kind,
        carriedById: String(fd.get("carriedById") ?? "") || null,
      },
      session.userId,
    );
    refreshCash();
    return `${kind === "RELIEF" ? "Alivio" : "Retiro"} de ${formatMoney(amountCents)} registrado`;
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

/** Retiros de hoy y usuarios activos (quién se lleva un alivio) para la ventana de la barra superior. */
export async function todayWithdrawalsAction(): Promise<{
  list: withdrawals.WithdrawalLine[];
  users: { id: string; name: string }[];
  me: string;
}> {
  const session = await requirePermission("cash.withdraw");
  const [list, users] = await Promise.all([withdrawals.listWithdrawals(businessDate()), withdrawals.listActiveUsers()]);
  return { list, users, me: session.userId };
}

// ---------------------------------------------------------------------------
// Depósitos al banco de alivios (solo quien maneja el libro: Admin por defecto)
// ---------------------------------------------------------------------------

export async function createDepositAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("cashbook.manage");
  return toActionResult(async () => {
    const d = await deposits.createDeposit(
      {
        date: String(fd.get("date") ?? ""),
        amountCents: moneyOrError(String(fd.get("amount") ?? "")),
        withdrawalIds: fd.getAll("withdrawalId").map(String),
        reference: String(fd.get("reference") ?? ""),
        note: String(fd.get("note") ?? ""),
        differenceReason: String(fd.get("differenceReason") ?? ""),
      },
      session.userId,
    );
    refreshCash();
    const diff = d.differenceCents;
    return `Depósito de ${formatMoney(d.amountCents)} registrado${
      diff === 0 ? "" : ` (${diff < 0 ? "faltante" : "sobrante"} ${formatMoney(Math.abs(diff))})`
    }`;
  });
}

export async function voidDepositAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("cashbook.manage");
  return toActionResult(async () => {
    await deposits.voidDeposit(String(fd.get("id") ?? ""), String(fd.get("reason") ?? ""), session.userId);
    refreshCash();
    return "Depósito anulado: sus alivios vuelven a pendientes";
  });
}

// ---------------------------------------------------------------------------
// Traspasos y saldos iniciales (libro de caja y bancos)
// ---------------------------------------------------------------------------

export async function createTransferAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("cashbook.manage");
  return toActionResult(async () => {
    const amountOutCents = moneyOrError(String(fd.get("amountOut") ?? ""));
    const inText = String(fd.get("amountIn") ?? "").trim();
    // Vacío = llega lo mismo que sale (sin comisión).
    const amountInCents = inText ? moneyOrError(inText) : amountOutCents;
    const t = await accounts.createTransfer(
      {
        date: String(fd.get("date") ?? ""),
        fromAccount: String(fd.get("fromAccount") ?? ""),
        toAccount: String(fd.get("toAccount") ?? ""),
        amountOutCents,
        amountInCents,
        reference: String(fd.get("reference") ?? ""),
        note: String(fd.get("note") ?? ""),
      },
      session.userId,
    );
    refreshCash();
    const commission = t.amountOutCents - t.amountInCents;
    return `Traspaso registrado${commission > 0 ? ` (comisión ${formatMoney(commission)})` : ""}`;
  });
}

export async function voidTransferAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("cashbook.manage");
  return toActionResult(async () => {
    await accounts.voidTransfer(String(fd.get("id") ?? ""), String(fd.get("reason") ?? ""), session.userId);
    refreshCash();
    return "Traspaso anulado";
  });
}

export async function setOpeningBalanceAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("cashbook.manage");
  return toActionResult(async () => {
    const text = String(fd.get("amount") ?? "").trim();
    if (!text) throw new DomainError("Ingresa el saldo (puede ser 0).");
    // Un banco puede estar en rojo: se acepta un signo menos adelante.
    const negative = text.startsWith("-");
    const cents = moneyOrError(negative ? text.slice(1) : text);
    await accounts.setOpeningBalance(
      {
        account: String(fd.get("account") ?? ""),
        date: String(fd.get("date") ?? ""),
        amountCents: negative ? -cents : cents,
        note: String(fd.get("note") ?? ""),
      },
      session.userId,
    );
    refreshCash();
    return "Saldo inicial guardado";
  });
}

export async function voidOpeningBalanceAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("cashbook.manage");
  return toActionResult(async () => {
    await accounts.voidOpeningBalance(String(fd.get("id") ?? ""), String(fd.get("reason") ?? ""), session.userId);
    refreshCash();
    return "Saldo inicial anulado";
  });
}
