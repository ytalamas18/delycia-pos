import { can } from "@/core/auth/permissions";
import { getSession } from "@/core/auth/server";
import { getClosingReport } from "@/modules/sales";

export const dynamic = "force-dynamic";

/**
 * Descarga del cierre de caja de un día:
 *   /api/reportes/cierre/2026-10-17            → PDF
 *   /api/reportes/cierre/2026-10-17?formato=csv → productos vendidos para Excel
 */
export async function GET(request: Request, { params }: RouteContext<"/api/reportes/cierre/[fecha]">) {
  const session = await getSession();
  if (!session || !can(session.role, "cash.close")) return Response.json({ error: "Sin permiso" }, { status: 403 });

  const { fecha } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return Response.json({ error: "Fecha inválida" }, { status: 400 });

  const format = new URL(request.url).searchParams.get("formato") === "csv" ? "csv" : "pdf";
  const report = await getClosingReport(fecha, format);
  return new Response(report.body as BodyInit, {
    headers: {
      "Content-Type": report.contentType,
      "Content-Disposition": `attachment; filename="${report.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
