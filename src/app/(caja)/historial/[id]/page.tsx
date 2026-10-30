import { requireModule } from "@/components/shell/require-module";
import { requirePermission } from "@/core/auth/server";
import { businessDate } from "@/core/time";
import { OrderDetail } from "@/modules/sales";

export default async function OrdenDetallePage({ params }: PageProps<"/historial/[id]">) {
  requireModule("sales");
  await requirePermission("sales.history");
  const { id } = await params;
  return <OrderDetail id={id} today={businessDate()} />;
}
