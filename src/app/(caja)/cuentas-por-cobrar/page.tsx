import { LiveRefresh } from "@/components/shell/live-refresh";
import { requireModule } from "@/components/shell/require-module";
import { requirePermission } from "@/core/auth/server";
import { Receivables } from "@/modules/sales";

export default async function CuentasPorCobrarPage() {
  requireModule("sales");
  await requirePermission("sales.sell");
  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold">Cuentas por cobrar</h1>
      <Receivables />
      <LiveRefresh prefixes={["order.paid", "credit."]} />
    </div>
  );
}
