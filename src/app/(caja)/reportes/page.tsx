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
      params={{
        desde: one(params.desde),
        hasta: one(params.hasta),
        vista: one(params.vista),
        cat: one(params.cat),
        orden: one(params.orden),
      }}
    />
  );
}
