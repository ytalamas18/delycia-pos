import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { appConfig } from "@/core/config/app";
import { formatMoney } from "@/core/money";

import { orderLabel, orderStatusLabel } from "../domain/labels";
import { listOpenOrders } from "../services/orders";

const time = new Intl.DateTimeFormat("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: appConfig.timezone });

/** Tarjetas de las órdenes por pagar. Tocar una la abre en la pantalla de venta. */
export async function OpenOrders() {
  const orders = await listOpenOrders();

  if (orders.length === 0) {
    return <p className="py-10 text-center text-muted-foreground">No hay órdenes por pagar.</p>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {orders.map((o) => {
        const items = o.items.filter((i) => i.status === "ACTIVE");
        const unsent = items
          .filter((i) => i.sendsToKitchen && !i.sentToKitchenAt)
          .reduce((sum, i) => sum + i.quantity, 0);
        return (
          <Link
            key={o.id}
            href={`/pos?orden=${o.id}`}
            className="space-y-2 rounded-xl border bg-card p-4 shadow-xs transition hover:border-primary active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-2xl font-bold">#{o.number}</div>
                <div className="text-lg font-medium">{orderLabel(o)}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant="secondary">{orderStatusLabel[o.status]}</Badge>
                {o.channel === "PEYA" && <Badge>PEYA</Badge>}
              </div>
            </div>
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {items.map((i) => `${i.quantity}× ${i.productName}`).join(", ") || "Sin ítems"}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {time.format(o.openedAt)}
                {unsent > 0 && ` · ${unsent} sin enviar a cocina`}
              </span>
              <span className="text-xl font-bold tabular-nums">{formatMoney(o.totalCents)}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
