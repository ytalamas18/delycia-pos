import { db } from "@/core/db/client";
import { runInTransaction } from "@/core/db/transaction";
import { DomainError } from "@/core/errors";
import { formatMoney } from "@/core/money";
import { businessDate } from "@/core/time";

import { toLines, userNames, type WithdrawalLine } from "./withdrawals";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(text: string | null | undefined, max: number, field: string): string | null {
  const t = (text ?? "").trim();
  if (t.length > max) throw new DomainError(`${field}: máximo ${max} caracteres.`);
  return t || null;
}

export type DepositInput = {
  date: string;
  /** Lo que llegó al banco. */
  amountCents: number;
  /** Alivios que cubre este depósito. */
  withdrawalIds: string[];
  reference?: string | null;
  note?: string | null;
  /** Obligatorio si lo que llegó no es la suma de los alivios. */
  differenceReason?: string | null;
};

/**
 * Registra un depósito al banco de uno o varios alivios pendientes. La plata pasa de "Por depositar" a Banco.
 * Si el monto no coincide con la suma de los alivios, se registra igual con motivo obligatorio.
 */
export async function createDeposit(input: DepositInput, userId: string, today = businessDate()) {
  if (!ISO_DATE.test(input.date)) throw new DomainError("Fecha inválida.");
  if (input.date > today) throw new DomainError("La fecha no puede ser futura.");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new DomainError("El monto depositado debe ser mayor a 0.");
  const ids = [...new Set(input.withdrawalIds)];
  if (ids.length === 0) throw new DomainError("Marca los alivios que cubre este depósito.");
  const reference = cleanText(input.reference, 60, "N° de comprobante");
  const note = cleanText(input.note, 200, "Nota");
  const differenceReason = cleanText(input.differenceReason, 200, "Motivo de la diferencia");

  return runInTransaction(async (tx, publish) => {
    // Bloquea los alivios: dos depósitos a la vez no pueden cubrir el mismo.
    await tx.$queryRaw`SELECT id FROM "CashWithdrawal" WHERE id = ANY(${ids}) FOR UPDATE`;
    const reliefs = await tx.cashWithdrawal.findMany({ where: { id: { in: ids } } });
    if (reliefs.length !== ids.length) throw new DomainError("Uno de los alivios no existe. Actualiza la pantalla.");
    for (const r of reliefs) {
      if (r.kind !== "RELIEF") throw new DomainError("Solo se depositan alivios (no retiros del dueño).");
      if (r.voidedAt) throw new DomainError("Uno de los alivios está anulado. Actualiza la pantalla.");
      if (r.depositId) throw new DomainError("Uno de los alivios ya se depositó. Actualiza la pantalla.");
      if (r.businessDate > input.date) throw new DomainError("La fecha del depósito no puede ser anterior a la del alivio.");
    }
    const reliefsCents = reliefs.reduce((s, r) => s + r.amountCents, 0);
    const diff = input.amountCents - reliefsCents;
    if (diff !== 0 && !differenceReason) {
      throw new DomainError(
        `Los alivios suman ${formatMoney(reliefsCents)} y llegaron ${formatMoney(input.amountCents)}: escribe el motivo de la diferencia.`,
      );
    }
    const deposit = await tx.bankDeposit.create({
      data: {
        date: input.date,
        amountCents: input.amountCents,
        reliefsCents,
        reference,
        note,
        differenceReason: diff !== 0 ? differenceReason : null,
        withdrawalIds: ids,
        createdById: userId,
      },
    });
    await tx.cashWithdrawal.updateMany({ where: { id: { in: ids } }, data: { depositId: deposit.id } });
    await publish("bank_deposit.changed", { depositId: deposit.id, date: deposit.date, voided: false });
    return { ...deposit, differenceCents: diff };
  });
}

/** Anula un depósito con motivo: sus alivios vuelven a "pendientes de depositar". */
export async function voidDeposit(id: string, reason: string, userId: string) {
  const text = reason.trim();
  if (!text) throw new DomainError("Escribe el motivo de la anulación.");
  return runInTransaction(async (tx, publish) => {
    await tx.$queryRaw`SELECT id FROM "BankDeposit" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.bankDeposit.findUnique({ where: { id } });
    if (!row) throw new DomainError("El depósito no existe.");
    if (row.voidedAt) throw new DomainError("Este depósito ya está anulado.");
    await tx.bankDeposit.update({ where: { id }, data: { voidedAt: new Date(), voidReason: text, voidedById: userId } });
    await tx.cashWithdrawal.updateMany({ where: { depositId: id }, data: { depositId: null } });
    await publish("bank_deposit.changed", { depositId: id, date: row.date, voided: true });
  });
}

/** Depósitos (vigentes y anulados) con fecha hasta `to` (y desde `from`), con los alivios que cubren. */
export async function listDeposits(range: { from?: string; to: string }) {
  const rows = await db.bankDeposit.findMany({
    where: { date: { gte: range.from, lte: range.to } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  const allIds = [...new Set(rows.flatMap((r) => r.withdrawalIds))];
  const reliefs: WithdrawalLine[] = allIds.length
    ? await toLines(await db.cashWithdrawal.findMany({ where: { id: { in: allIds } }, orderBy: { createdAt: "asc" } }))
    : [];
  const byId = new Map(reliefs.map((r) => [r.id, r]));
  const names = await userNames(rows.flatMap((r) => [r.createdById, r.voidedById]));
  return rows.map((r) => ({
    ...r,
    differenceCents: r.amountCents - r.reliefsCents,
    reliefs: r.withdrawalIds.map((id) => byId.get(id)).filter((x): x is WithdrawalLine => !!x),
    createdByName: names.get(r.createdById) ?? null,
    voidedByName: r.voidedById ? (names.get(r.voidedById) ?? null) : null,
  }));
}

export type DepositRow = Awaited<ReturnType<typeof listDeposits>>[number];
