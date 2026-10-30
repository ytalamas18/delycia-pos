import { notFound } from "next/navigation";

import { requireModule } from "@/components/shell/require-module";
import { can } from "@/core/auth/permissions";
import { requirePermission } from "@/core/auth/server";
import { getSetting } from "@/core/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { businessDate } from "@/core/time";
import { getSellableCatalog } from "@/modules/catalog";
import {
  getOpening,
  getOrder,
  OpeningForm,
  salesAbilities,
  peyaMarkupSetting,
  PosScreen,
  type PosOrder,
  type PosProduct,
} from "@/modules/sales";

export default async function PosPage({ searchParams }: PageProps<"/pos">) {
  requireModule("sales");
  const session = await requirePermission("sales.pos");
  // Antes de la primera venta del día hay que abrir la caja con el efectivo inicial.
  if (!(await getOpening(businessDate()))) {
    if (!can(session, "cash.close")) {
      return <p className="text-lg">La caja de hoy todavía no está abierta. Pide a quien la abre que lo haga para empezar a vender.</p>;
    }
    return (
      <div className="flex flex-1 items-start justify-center pt-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-2xl">Apertura de caja</CardTitle>
            <CardDescription>Antes de vender, registra con cuánto efectivo empieza el día.</CardDescription>
          </CardHeader>
          <CardContent>
            <OpeningForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  const { orden, cobrar, cobrada } = await searchParams;
  const orderId = typeof orden === "string" ? orden : null;
  const paidOrder = typeof cobrada === "string" ? await getOrder(cobrada) : null;
  const paid =
    paidOrder && (paidOrder.status === "PAID" || paidOrder.status === "CLOSED")
      ? {
          orderId: paidOrder.id,
          number: paidOrder.number,
          totalCents: paidOrder.totalCents,
          changeCents: paidOrder.payments.reduce((s, p) => s + (p.changeCents ?? 0), 0),
          unsentKitchen: paidOrder.items.filter(
            (i) => i.status === "ACTIVE" && i.sendsToKitchen && !i.sentToKitchenAt,
          ).length,
          kitchenItems: paidOrder.items.filter((i) => i.status === "ACTIVE" && i.sendsToKitchen).length,
        }
      : null;

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
      key={`${posOrder?.id ?? "nueva"}-${cobrar ?? ""}-${paid?.orderId ?? ""}`}
      categories={catalog.map((c) => ({ id: c.id, name: c.name }))}
      products={products}
      peyaMarkupPercent={peya}
      order={posOrder}
      openCheckout={cobrar === "1" && can(session, "sales.charge")}
      paid={paid}
      abilities={salesAbilities(session)}
    />
  );
}
