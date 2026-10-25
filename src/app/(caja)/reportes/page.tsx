import { requireModule } from "@/components/shell/require-module";
import { requirePermission } from "@/core/auth/server";
import { ReportsScreen } from "@/modules/reports";

export default async function ReportesPage({ searchParams }: PageProps<"/reportes">) {
  requireModule("reports");
  await requirePermission("reports.view");
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return (
    <ReportsScreen
      params={Object.fromEntries(
        ["desde", "hasta", "vista", "cat", "orden", "estado", "cliente", "tipo", "item"].map((k) => [k, one(params[k])]),
      )}
    />
  );
}
