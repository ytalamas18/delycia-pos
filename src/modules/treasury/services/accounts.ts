import { db } from "@/core/db/client";
import { runInTransaction } from "@/core/db/transaction";
import { DomainError, isUniqueViolation } from "@/core/errors";
import { isMoneyAccount, MONEY_ACCOUNT_LABEL } from "@/core/money/accounts";
import { businessDate } from "@/core/time";
import type { MoneyAccount } from "@/generated/prisma/enums";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function userNames(ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map<string, string>();
  const users = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

function checkDate(date: string, today: string) {
  if (!ISO_DATE.test(date)) throw new DomainError("Fecha inválida.");
  if (date > today) throw new DomainError("La fecha no puede ser futura.");
}

function cleanText(text: string | null | undefined, max: number, field: string): string | null {
  const t = (text ?? "").trim();
  if (t.length > max) throw new DomainError(`${field}: máximo ${max} caracteres.`);
  return t || null;
}

// ---------------------------------------------------------------------------
// Traspasos / depósitos entre cuentas
// ---------------------------------------------------------------------------

export type TransferInput = {
  date: string;
  fromAccount: string;
  toAccount: string;
  amountOutCents: number;
  amountInCents: number;
  reference?: string | null;
  note?: string | null;
};

/**
 * Registra un depósito / traspaso. La comisión (sale − llega) se calcula sola. Un traspaso desde Efectivo
 * sale de la caja del día: solo con la fecha de hoy (resta del efectivo esperado del cierre de hoy).
 */
export async function createTransfer(input: TransferInput, userId: string, today = businessDate()) {
  checkDate(input.date, today);
  if (!isMoneyAccount(input.fromAccount) || !isMoneyAccount(input.toAccount)) throw new DomainError("Elige las cuentas.");
  if (input.fromAccount === input.toAccount) throw new DomainError("La cuenta de origen y la de destino deben ser distintas.");
  for (const v of [input.amountOutCents, input.amountInCents]) {
    if (!Number.isSafeInteger(v) || v <= 0) throw new DomainError("Los montos deben ser mayores a 0.");
  }
  if (input.toAccount === "CASH") {
    // El cierre de caja no suma dinero que entra por traspaso: por ahora solo se deposita desde la caja.
    throw new DomainError("Por ahora no se registran traspasos hacia Efectivo.");
  }
  if (input.amountInCents > input.amountOutCents) {
    throw new DomainError("Lo que llega no puede ser más de lo que sale (la diferencia es la comisión).");
  }
  if (input.fromAccount === "CASH" && input.date !== today) {
    throw new DomainError("Un traspaso desde Efectivo sale de la caja de hoy: usa la fecha de hoy.");
  }
  const data = {
    date: input.date,
    fromAccount: input.fromAccount,
    toAccount: input.toAccount,
    amountOutCents: input.amountOutCents,
    amountInCents: input.amountInCents,
    reference: cleanText(input.reference, 60, "N° de comprobante"),
    note: cleanText(input.note, 200, "Nota"),
    createdById: userId,
  };
  return runInTransaction(async (tx, publish) => {
    const row = await tx.accountTransfer.create({ data });
    await publish("account_transfer.changed", {
      transferId: row.id,
      date: row.date,
      fromAccount: row.fromAccount,
      toAccount: row.toAccount,
      voided: false,
    });
    return row;
  });
}

/** Anula un traspaso con motivo. Si salió de Efectivo, solo el mismo día (la caja de días anteriores ya cerró). */
export async function voidTransfer(id: string, reason: string, userId: string, today = businessDate()) {
  const text = reason.trim();
  if (!text) throw new DomainError("Escribe el motivo de la anulación.");
  return runInTransaction(async (tx, publish) => {
    await tx.$queryRaw`SELECT id FROM "AccountTransfer" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.accountTransfer.findUnique({ where: { id } });
    if (!row) throw new DomainError("El traspaso no existe.");
    if (row.voidedAt) throw new DomainError("Este traspaso ya está anulado.");
    if (row.fromAccount === "CASH" && row.date !== today) {
      throw new DomainError("Un traspaso desde Efectivo solo se anula el mismo día.");
    }
    await tx.accountTransfer.update({ where: { id }, data: { voidedAt: new Date(), voidReason: text, voidedById: userId } });
    await publish("account_transfer.changed", {
      transferId: id,
      date: row.date,
      fromAccount: row.fromAccount,
      toAccount: row.toAccount,
      voided: true,
    });
  });
}

/** Traspasos (vigentes y anulados) con fecha hasta `to` (y desde `from`, si se da), con nombres. */
export async function listTransfers(range: { from?: string; to: string }) {
  const rows = await db.accountTransfer.findMany({
    where: { date: { gte: range.from, lte: range.to } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  const names = await userNames(rows.flatMap((r) => [r.createdById, r.voidedById]));
  return rows.map((r) => ({
    ...r,
    commissionCents: r.amountOutCents - r.amountInCents,
    createdByName: names.get(r.createdById) ?? null,
    voidedByName: r.voidedById ? (names.get(r.voidedById) ?? null) : null,
  }));
}

export type TransferRow = Awaited<ReturnType<typeof listTransfers>>[number];

/** Traspasos vigentes que salieron de Efectivo en un día: restan del efectivo esperado del cierre. */
export async function cashTransfersForDay(date: string) {
  const rows = (await listTransfers({ from: date, to: date })).filter((t) => t.fromAccount === "CASH" && !t.voidedAt);
  return {
    totalCents: rows.reduce((s, t) => s + t.amountOutCents, 0),
    items: rows.map((t) => ({
      at: t.createdAt.toISOString(),
      toAccount: t.toAccount,
      amountOutCents: t.amountOutCents,
      amountInCents: t.amountInCents,
      reference: t.reference,
      byName: t.createdByName,
    })),
  };
}

export type CashTransfersForDay = Awaited<ReturnType<typeof cashTransfersForDay>>;

// ---------------------------------------------------------------------------
// Saldos iniciales
// ---------------------------------------------------------------------------

/** Carga el saldo inicial de una cuenta (uno vigente por cuenta: para corregir, anular y volver a cargar). */
export async function setOpeningBalance(
  input: { account: string; date: string; amountCents: number; note?: string | null },
  userId: string,
  today = businessDate(),
) {
  if (!isMoneyAccount(input.account)) throw new DomainError("Elige la cuenta.");
  checkDate(input.date, today);
  if (!Number.isSafeInteger(input.amountCents)) throw new DomainError("Monto inválido.");
  const account: MoneyAccount = input.account;
  const existing = await db.accountOpeningBalance.findFirst({ where: { account, voidedAt: null } });
  if (existing) {
    throw new DomainError(`${MONEY_ACCOUNT_LABEL[account]} ya tiene saldo inicial. Para corregirlo, anúlalo y vuelve a cargarlo.`);
  }
  try {
    return await runInTransaction(async (tx, publish) => {
      const row = await tx.accountOpeningBalance.create({
        data: { account, date: input.date, amountCents: input.amountCents, note: cleanText(input.note, 200, "Nota"), createdById: userId },
      });
      await publish("account_opening.changed", { openingId: row.id, account, voided: false });
      return row;
    });
  } catch (error) {
    // Dos personas cargando a la vez: gana la primera (índice único parcial).
    if (isUniqueViolation(error)) throw new DomainError(`${MONEY_ACCOUNT_LABEL[account]} ya tiene saldo inicial.`);
    throw error;
  }
}

export async function voidOpeningBalance(id: string, reason: string, userId: string) {
  const text = reason.trim();
  if (!text) throw new DomainError("Escribe el motivo de la anulación.");
  return runInTransaction(async (tx, publish) => {
    const row = await tx.accountOpeningBalance.findUnique({ where: { id } });
    if (!row) throw new DomainError("El saldo inicial no existe.");
    if (row.voidedAt) throw new DomainError("Este saldo inicial ya está anulado.");
    await tx.accountOpeningBalance.update({ where: { id }, data: { voidedAt: new Date(), voidReason: text, voidedById: userId } });
    await publish("account_opening.changed", { openingId: id, account: row.account, voided: true });
  });
}

/** Saldos iniciales (vigentes y anulados), con nombres. */
export async function listOpeningBalances() {
  const rows = await db.accountOpeningBalance.findMany({ orderBy: { createdAt: "asc" } });
  const names = await userNames(rows.flatMap((r) => [r.createdById, r.voidedById]));
  return rows.map((r) => ({
    ...r,
    createdByName: names.get(r.createdById) ?? null,
    voidedByName: r.voidedById ? (names.get(r.voidedById) ?? null) : null,
  }));
}
