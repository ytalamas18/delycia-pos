import { requireModule } from "@/components/shell/require-module";
import { requirePermission } from "@/core/auth/server";
import { businessDate } from "@/core/time";
import { ClosingView } from "@/modules/sales";

export default async function CierrePage({ searchParams }: PageProps<"/cierre">) {
  requireModule("sales");
  await requirePermission("cash.close");
  const { fecha } = await searchParams;
  const date = typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : businessDate();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Cierre de caja</h1>
      <ClosingView date={date} />
    </div>
  );
}
