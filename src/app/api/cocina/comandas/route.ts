import { can } from "@/core/auth/permissions";
import { getSession } from "@/core/auth/server";
import { getKdsSnapshot } from "@/modules/kitchen";

export const dynamic = "force-dynamic";

/** Estado completo de la pantalla de cocina (se pide al conectar y tras cada evento). */
export async function GET() {
  const session = await getSession();
  if (!session || !can(session, "kitchen.view")) {
    return Response.json({ error: "Sin permiso" }, { status: 403 });
  }
  return Response.json(await getKdsSnapshot(), { headers: { "Cache-Control": "no-store" } });
}
