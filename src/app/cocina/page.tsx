import { requireModule } from "@/components/shell/require-module";
import { can } from "@/core/auth/permissions";
import { requirePermission } from "@/core/auth/server";
import { getKdsSnapshot, KdsBoard } from "@/modules/kitchen";

export default async function CocinaPage() {
  requireModule("kitchen");
  const session = await requirePermission("kitchen.view");
  const snapshot = await getKdsSnapshot();
  // Caja puede mirar la pantalla de cocina, pero solo cocina (y admin) cambian estados.
  return <KdsBoard initial={snapshot} canOperate={can(session, "kitchen.operate")} />;
}
