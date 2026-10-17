import { notFound } from "next/navigation";

import { requireModule } from "@/components/shell/require-module";
import { requirePermission } from "@/core/auth/server";
import { getSetting } from "@/core/settings";
import { getSellableCatalog } from "@/modules/catalog";
import { getOrder, peyaMarkupSetting, PosScreen, type PosOrder, type PosProduct } from "@/modules/sales";

export default async function PosPage({ searchParams }: PageProps<"/pos">) {
  requireModule("sales");
  await requirePermission("sales.sell");
  const { orden } = await searchParams;
  const orderId = typeof orden === "string" ? orden : null;

  const [catalog, peya, order] = await Promise.all([
    getSellableCatalog(),
    getSetting(peyaMarkupSetting),
    orderId ? getOrder(orderId) : null,
  ]);
  if (orderId && !order) notFound();

  const products: PosProduct[] = catalog.flatMap((c) => c.products.map((p) => ({ ...p, categoryId: c.id })));
  const posOrder: PosOrder | null =
    order && order.status === "OPEN"
      ? {
          id: order.id,
          number: order.number,
          channel: order.channel,
          serviceType: order.serviceType,
          tableNumber: order.tableNumber,
          customerName: order.customerName,
          markupPercent: Number(order.channelMarkupPercent),
          items: order.items
            .filter((i) => i.status === "ACTIVE")
            .map((i) => ({
              id: i.id,
              productName: i.productName,
              unitPriceCents: i.unitPriceCents,
              quantity: i.quantity,
              note: i.note,
              serviceType: i.serviceType,
              modifiers: (i.modifiers as { name: string }[]).map((m) => m.name),
              sendsToKitchen: i.sendsToKitchen,
              sentToKitchen: i.sentToKitchenAt !== null,
            })),
        }
      : null;

  if (order && !posOrder) {
    return <p className="text-lg">La orden #{order.number} ya fue pagada o anulada: no se puede modificar.</p>;
  }

  return (
    <PosScreen
      // key: al cambiar de orden, la pantalla se reinicia con sus datos
      key={posOrder?.id ?? "nueva"}
      categories={catalog.map((c) => ({ id: c.id, name: c.name }))}
      products={products}
      peyaMarkupPercent={peya}
      order={posOrder}
    />
  );
}
