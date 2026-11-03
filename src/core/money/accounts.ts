// Sin Decimal ni Prisma client: se puede usar en componentes de cliente.
import type { MoneyAccount } from "@/generated/prisma/enums";

/**
 * Cuentas de dinero del negocio (libro de caja y bancos). Las comparten Compras (de dónde sale un pago),
 * Caja y bancos (retiros, traspasos, alivios, depósitos, saldos) y Reportes.
 */

/** Cuentas que se eligen al pagar a un proveedor o en un traspaso. */
export const MONEY_ACCOUNTS: readonly MoneyAccount[] = ["CASH", "BANK", "ATC_PEYA"];

/** Todas las cuentas del libro: las de arriba + "Por depositar" (alivios que alguien lleva al banco). */
export const LEDGER_ACCOUNTS: readonly MoneyAccount[] = ["CASH", "PENDING_DEPOSIT", "BANK", "ATC_PEYA"];

export const MONEY_ACCOUNT_LABEL: Record<MoneyAccount, string> = {
  CASH: "Efectivo (caja)",
  BANK: "Banco (QR)",
  ATC_PEYA: "ATC / PeYa",
  PENDING_DEPOSIT: "Por depositar",
};

/** ¿Es una cuenta que se puede elegir al pagar o en un traspaso? */
export function isMoneyAccount(value: unknown): value is MoneyAccount {
  return typeof value === "string" && (MONEY_ACCOUNTS as readonly string[]).includes(value);
}

/** ¿Es una cuenta del libro (incluye "Por depositar")? */
export function isLedgerAccount(value: unknown): value is MoneyAccount {
  return typeof value === "string" && (LEDGER_ACCOUNTS as readonly string[]).includes(value);
}
