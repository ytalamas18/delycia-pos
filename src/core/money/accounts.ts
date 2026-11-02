// Sin Decimal ni Prisma client: se puede usar en componentes de cliente.
import type { MoneyAccount } from "@/generated/prisma/enums";

/**
 * Cuentas de dinero del negocio (libro de caja y bancos). Las comparten Compras (de dónde sale un pago),
 * Caja y bancos (retiros, traspasos, saldos) y Reportes.
 */
export const MONEY_ACCOUNTS: readonly MoneyAccount[] = ["CASH", "BANK", "ATC_PEYA"];

export const MONEY_ACCOUNT_LABEL: Record<MoneyAccount, string> = {
  CASH: "Efectivo (caja)",
  BANK: "Banco (QR)",
  ATC_PEYA: "ATC / PeYa",
};

export function isMoneyAccount(value: unknown): value is MoneyAccount {
  return typeof value === "string" && (MONEY_ACCOUNTS as readonly string[]).includes(value);
}
