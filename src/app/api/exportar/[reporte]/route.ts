import { can, type Permission } from "@/core/auth/permissions";
import { getSession } from "@/core/auth/server";
import { exportResponse, parseExportFormat, type ExportDocument } from "@/core/export";
import { businessDate } from "@/core/time";
import { modules } from "@/config/modules";
import { reportExports } from "@/modules/reports";
import { buildHistoryExport } from "@/modules/sales";

export const dynamic = "force-dynamic";

type Exporter = { module: string; permission: Permission; build: (params: Record<string, string>) => Promise<ExportDocument> };

/** Qué se puede exportar y quién. Agregar un reporte = agregar una línea aquí (o en reportExports). */
const exporters: Record<string, Exporter> = {
  historial: {
    module: "sales",
    permission: "sales.history",
    build: (p) => {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(p.fecha ?? "") ? p.fecha : businessDate();
      return buildHistoryExport(date, p);
    },
  },
  ...Object.fromEntries(
    Object.entries(reportExports).map(([key, build]) => [key, { module: "reports", permission: "reports.view", build }]),
  ),
};

/**
 * Descarga de cualquier reporte con los mismos filtros de la pantalla:
 *   /api/exportar/ventas-por-canal?desde=2026-10-01&hasta=2026-10-18&formato=xlsx
 *   /api/exportar/historial?fecha=2026-10-18&estado=CANCELLED&formato=pdf
 */
export async function GET(request: Request, { params }: RouteContext<"/api/exportar/[reporte]">) {
  const { reporte } = await params;
  const exporter = exporters[reporte];
  if (!exporter || !modules.isEnabled(exporter.module)) return Response.json({ error: "Reporte no encontrado" }, { status: 404 });

  const session = await getSession();
  if (!session || !can(session, exporter.permission)) return Response.json({ error: "Sin permiso" }, { status: 403 });

  const search = new URL(request.url).searchParams;
  const format = parseExportFormat(search.get("formato"));
  if (!format) return Response.json({ error: "Formato inválido (xlsx o pdf)" }, { status: 400 });

  const doc = await exporter.build(Object.fromEntries(search));
  return exportResponse(doc, format);
}
