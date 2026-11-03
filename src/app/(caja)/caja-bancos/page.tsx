import { requireModule } from "@/components/shell/require-module";
import { can } from "@/core/auth/permissions";
import { requirePermission } from "@/core/auth/server";
import { isLedgerAccount } from "@/core/money/accounts";
import { businessDate } from "@/core/time";
import { CashbookView, parseReportRange } from "@/modules/reports";
import { TreasuryRecords } from "@/modules/treasury";

export default async function CajaBancosPage({ searchParams }: PageProps<"/caja-bancos">) {
  requireModule("treasury");
  const session = await requirePermission("cashbook.view");
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  // Sin fechas: el mes en curso (como el cuaderno).
  const today = businessDate();
  const range = parseReportRange({ desde: one(params.desde) ?? (one(params.hasta) ? undefined : `${today.slice(0, 8)}01`), hasta: one(params.hasta) ?? today });
  const cuenta = one(params.cuenta);
  return (
    <div className="max-w-6xl space-y-6">
      <h1 className="text-2xl font-bold">Libro de caja y bancos</h1>
      <CashbookView range={range} account={isLedgerAccount(cuenta) ? cuenta : null} />
      <TreasuryRecords range={range} canManage={can(session, "cashbook.manage")} />
    </div>
  );
}
