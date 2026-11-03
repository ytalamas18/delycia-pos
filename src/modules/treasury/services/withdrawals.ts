import { db } from "@/core/db/client";
import { runInTransaction } from "@/core/db/transaction";
import { DomainError } from "@/core/errors";
import { businessDate } from "@/core/time";
import type { CashWithdrawal } from "@/generated/prisma/client";
import type { WithdrawalKind } from "@/generated/prisma/enums";

/** Un retiro tal como se muestra (pantalla, cierre y su copia guardada). Las horas van como texto ISO. */
export type WithdrawalLine = {
  id: string;
  businessDate: string;
  at: string;
  amountCents: number;
  reason: string;
  /** OWNER = retiro del dueño (sale del negocio); RELIEF = alivio para depositar. */
  kind: WithdrawalKind;
  /** Alivio: quién se lleva la plata. */
  carriedByName: string | null;
  /** Alivio: depósito que lo cubrió (null = pendiente). */
  depositId: string | null;
  byName: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  voidedByName: string | null;
};

export const WITHDRAWAL_KIND_LABEL: Record<WithdrawalKind, string> = {
  RELIEF: "Alivio (para depositar)",
  OWNER: "Retiro del dueño",
};

export async function userNames(ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map<string, string>();
  const users = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

export async function toLines(rows: CashWithdrawal[]): Promise<WithdrawalLine[]> {
  const names = await userNames(rows.flatMap((r) => [r.createdById, r.voidedById, r.carriedById]));
  return rows.map((r) => ({
    id: r.id,
    businessDate: r.businessDate,
    at: r.createdAt.toISOString(),
    amountCents: r.amountCents,
    reason: r.reason,
    kind: r.kind,
    carriedByName: r.carriedById ? (names.get(r.carriedById) ?? null) : null,
    depositId: r.depositId,
    byName: names.get(r.createdById) ?? null,
    voidedAt: r.voidedAt?.toISOString() ?? null,
    voidReason: r.voidReason,
    voidedByName: r.voidedById ? (names.get(r.voidedById) ?? null) : null,
  }));
}

/** Retiros de un día de negocio (vigentes y anulados), del más antiguo al más nuevo. */
export async function listWithdrawals(date: string): Promise<WithdrawalLine[]> {
  return toLines(await db.cashWithdrawal.findMany({ where: { businessDate: date }, orderBy: { createdAt: "asc" } }));
}

/** Resumen para el cierre de caja: el total vigente (alivios y retiros) resta del esperado; los anulados aparte. */
export async function withdrawalsForDay(date: string) {
  const all = await listWithdrawals(date);
  const items = all.filter((w) => !w.voidedAt);
  return { totalCents: items.reduce((s, w) => s + w.amountCents, 0), items, voided: all.filter((w) => w.voidedAt) };
}

export type WithdrawalsForDay = Awaited<ReturnType<typeof withdrawalsForDay>>;

/** Alivios vigentes que todavía no se depositaron (el más antiguo primero). */
export async function listPendingReliefs(): Promise<WithdrawalLine[]> {
  return toLines(
    await db.cashWithdrawal.findMany({
      where: { kind: "RELIEF", voidedAt: null, depositId: null },
      orderBy: { createdAt: "asc" },
    }),
  );
}

/** Usuarios activos (para elegir quién se lleva un alivio). */
export function listActiveUsers() {
  return db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export type WithdrawalInput = {
  amountCents: number;
  reason?: string | null;
  kind?: WithdrawalKind;
  /** Obligatorio en un alivio: usuario activo que se lleva la plata. */
  carriedById?: string | null;
};

/**
 * Registra un retiro en la caja del día de negocio actual. Sin PIN: se autoriza por escrito.
 * - Alivio: alguien (usuario activo) se lleva la plata para depositarla; el motivo es opcional ("Alivio").
 * - Retiro del dueño: sale del negocio; el motivo es obligatorio.
 */
export async function createWithdrawal(input: WithdrawalInput, userId: string, date = businessDate()) {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new DomainError("El monto debe ser mayor a 0.");
  const kind: WithdrawalKind = input.kind ?? "OWNER";
  let reason = (input.reason ?? "").trim();
  if (reason.length > 200) throw new DomainError("El motivo es muy largo (máximo 200 caracteres).");
  let carriedById: string | null = null;
  if (kind === "RELIEF") {
    if (!input.carriedById) throw new DomainError("Elige quién se lleva la plata del alivio.");
    const carrier = await db.user.findUnique({ where: { id: input.carriedById }, select: { active: true } });
    if (!carrier?.active) throw new DomainError("Quien se lleva el alivio debe ser un usuario activo.");
    carriedById = input.carriedById;
    reason ||= "Alivio";
  } else if (!reason) {
    throw new DomainError("Escribe el motivo del retiro.");
  }
  return runInTransaction(async (tx, publish) => {
    const row = await tx.cashWithdrawal.create({
      data: { businessDate: date, amountCents: input.amountCents, reason, kind, carriedById, createdById: userId },
    });
    await publish("cash.withdrawal_changed", { withdrawalId: row.id, businessDate: date, amountCents: row.amountCents, voided: false });
    return row;
  });
}

/**
 * Anula un retiro (no se borra). Solo el mismo día de negocio: los días anteriores ya cerraron caja.
 * Un alivio ya depositado no se anula: primero se anula el depósito.
 */
export async function voidWithdrawal(id: string, reason: string, userId: string, today = businessDate()) {
  const text = reason.trim();
  if (!text) throw new DomainError("Escribe el motivo de la anulación.");
  return runInTransaction(async (tx, publish) => {
    await tx.$queryRaw`SELECT id FROM "CashWithdrawal" WHERE id = ${id} FOR UPDATE`;
    const row = await tx.cashWithdrawal.findUnique({ where: { id } });
    if (!row) throw new DomainError("El retiro no existe.");
    if (row.voidedAt) throw new DomainError("Este retiro ya está anulado.");
    if (row.businessDate !== today) throw new DomainError("Solo se puede anular un retiro del día de hoy.");
    if (row.depositId) throw new DomainError("Este alivio ya se depositó: primero anula el depósito.");
    await tx.cashWithdrawal.update({ where: { id }, data: { voidedAt: new Date(), voidReason: text, voidedById: userId } });
    await publish("cash.withdrawal_changed", { withdrawalId: id, businessDate: row.businessDate, amountCents: row.amountCents, voided: true });
  });
}

/** Retiros (vigentes y anulados) de un rango de días de negocio (para el libro de caja y bancos). */
export async function listWithdrawalsInRange(range: { from?: string; to: string }): Promise<WithdrawalLine[]> {
  return toLines(
    await db.cashWithdrawal.findMany({
      where: { businessDate: { gte: range.from, lte: range.to } },
      orderBy: { createdAt: "asc" },
    }),
  );
}
