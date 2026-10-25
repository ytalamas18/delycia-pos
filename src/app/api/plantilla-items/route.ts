import { can } from "@/core/auth/permissions";
import { getSession } from "@/core/auth/server";
import { buildImportTemplate } from "@/modules/catalog";

export const dynamic = "force-dynamic";

/** Plantilla .xlsx para la carga rápida de ítems. */
export async function GET() {
  const session = await getSession();
  if (!session || !can(session.role, "catalog.manage")) return Response.json({ error: "Sin permiso" }, { status: 403 });
  const body = await buildImportTemplate();
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-items-delycia.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
