import { db } from "@/core/db/client";
import { runInTransaction } from "@/core/db/transaction";
import { DomainError } from "@/core/errors";
import { businessDate } from "@/core/time";

/** Un retiro tal como se muestra (pantalla, cierre y su copia guardada). Las horas van como texto ISO. */
export type WithdrawalLine = {
  id: string;
  at: string;
  amountCents: number;
  reason: string;
  byName: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  voidedByName: string | null;
};

async function userNames(ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map<string, string>();
  const users = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

/** Retiros de un día de negocio (vigentes y anulados), del más antiguo al más nuevo. */
export async function listWithdrawals(date: string): Promise<WithdrawalLine[]> {
  const rows = await db.cashWithdrawal.findMany({ where: { businessDate: date }, orderBy: { createdAt: "asc" } });
  const names = await userNames(rows.flatMap((r) => [r.createdById, r.voidedById]));
  return rows.map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    amountCents: r.amountCents,
    reason: r.reason,
    byName: names.get(r.createdById) ?? null,
    voidedAt: r.voidedAt?.toISOString() ?? null,
    voidReason: r.voidReason,
    voidedByName: r.voidedById ? (names.get(r.voidedById) ?? null) : null,
  }));
}

/** Resumen para el cierre de caja: el total vigente resta del efectivo esperado; los anulados se informan aparte. */
export async function withdrawalsForDay(date: string) {
  const all = await listWithdrawals(date);
  const items = all.filter((w) => !w.voidedAt);
  return { totalCents: items.reduce((s, w) => s + w.amountCents, 0), items, voided: all.filter((w) => w.voidedAt) };
}

export type WithdrawalsForDay = Awaited<ReturnType<typeof withdrawalsForDay>>;

/** Registra un retiro de efectivo en la caja del día de negocio actual. Sin PIN: se autoriza por escrito. */
export async function createWithdrawal(input: { amountCents: number; reason: string }, userId: string, date = businessDate()) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new DomainError("El monto debe ser mayor a 0.");
  const reason = input.reason.trim();
  if (!reason) throw new DomainError("Escribe el motivo del retiro.");
  if (reason.length > 200) throw new DomainError("El motivo es muy largo (máximo 200 caracteres).");
  return runInTransaction(async (tx, publish) => {
    const row = await tx.cashWithdrawal.create({
      data: { businessDate: date, amountCents: input.amountCents, reason, createdById: userId },
    });
    await publish("cash.withdrawal_changed", { withdrawalId: row.id, businessDate: date, amountCents: row.amountCents, voided: false });
    return row;
  });
}

/** Anula un retiro (no se borra). Solo el mismo día de negocio: los días anteriores ya cerraron caja. */
export async function voidWithdrawal(id: string, reason: string, userId: string, today = businessDate()) {
  const text = reason.trim();
  if (!text) throw new DomainError("Escribe el motivo de la anulación.");
  return runInTransaction(async (tx, publish) => {
    await tx.$queryRaw`SELECT id FROM "CashWithdrawal" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.cashWithdrawal.findUnique({ where: { id } });
    if (!row) throw new DomainError("El retiro no existe.");
    if (row.voidedAt) throw new DomainError("Este retiro ya está anulado.");
    if (row.businessDate !== today) throw new DomainError("Solo se puede anular un retiro del día de hoy.");
    await tx.cashWithdrawal.update({ where: { id }, data: { voidedAt: new Date(), voidReason: text, voidedById: userId } });
    await publish("cash.withdrawal_changed", { withdrawalId: id, businessDate: row.businessDate, amountCents: row.amountCents, voided: true });
  });
}

/** Retiros (vigentes y anulados) de un rango de días de negocio (para el libro de caja y bancos). */
export async function listWithdrawalsInRange(range: { from?: string; to: string }): Promise<(WithdrawalLine & { businessDate: string })[]> {
  const rows = await db.cashWithdrawal.findMany({
    where: { businessDate: { gte: range.from, lte: range.to } },
    orderBy: { createdAt: "asc" },
  });
  const names = await userNames(rows.flatMap((r) => [r.createdById, r.voidedById]));
  return rows.map((r) => ({
    id: r.id,
    businessDate: r.businessDate,
    at: r.createdAt.toISOString(),
    amountCents: r.amountCents,
    reason: r.reason,
    byName: names.get(r.createdById) ?? null,
    voidedAt: r.voidedAt?.toISOString() ?? null,
    voidReason: r.voidReason,
    voidedByName: r.voidedById ? (names.get(r.voidedById) ?? null) : null,
  }));
}
