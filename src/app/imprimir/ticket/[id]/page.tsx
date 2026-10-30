import { notFound } from "next/navigation";

import { PrintOnLoad } from "@/components/print/print-on-load";
import { requirePermission } from "@/core/auth/server";
import { appConfig } from "@/core/config/app";
import { formatMoney } from "@/core/money";
import { getOrder, orderLabel, paymentMethodLabel } from "@/modules/sales";

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short", timeZone: appConfig.timezone });

/** Ticket del cliente (80 mm). No es factura. */
export default async function ImprimirTicketPage({ params }: PageProps<"/imprimir/ticket/[id]">) {
  await requirePermission(["sales.pos", "sales.history"]);
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  const items = order.items.filter((i) => i.status === "ACTIVE");
  const payments = order.payments.filter((p) => !p.refundedAt);
  const change = payments.reduce((s, p) => s + (p.changeCents ?? 0), 0);

  return (
    <div>
      <div className="text-center text-[18px] font-bold">{appConfig.businessName.toUpperCase()}</div>
      <div className="text-center">{appConfig.ticket.address}</div>
      <div className="text-center">Tel. {appConfig.ticket.phone}</div>
      <hr className="my-2 border-dashed border-black" />
      <div className="flex justify-between font-bold">
        <span>Orden #{order.number}</span>
        <span>{dateTime.format(order.paidAt ?? order.openedAt)}</span>
      </div>
      <div>{orderLabel(order)}</div>
      {order.status === "CANCELLED" && <div className="text-center font-bold">*** ANULADA ***</div>}
      <hr className="my-2 border-dashed border-black" />
      {items.map((item) => (
        <div key={item.id} className="mb-1">
          <div className="flex justify-between gap-2">
            <span>
              {item.quantity} x {item.productName}
            </span>
            <span className="whitespace-nowrap">{formatMoney(item.unitPriceCents * item.quantity)}</span>
          </div>
          {(item.modifiers as { name: string }[]).map((m) => (
            <div key={m.name} className="pl-2 text-[12px]">
              + {m.name}
            </div>
          ))}
        </div>
      ))}
      <hr className="my-2 border-dashed border-black" />
      <Line label="Subtotal" value={formatMoney(order.subtotalCents)} />
      {order.discountCents > 0 && <Line label="Descuento" value={`-${formatMoney(order.discountCents)}`} />}
      <Line label="TOTAL" value={formatMoney(order.totalCents)} bold />
      {payments.length > 0 && <hr className="my-2 border-dashed border-black" />}
      {payments.map((p) => (
        <Line
          key={p.id}
          label={p.method === "CASH" && p.tenderedCents ? `Efectivo recibido` : paymentMethodLabel[p.method]}
          value={formatMoney(p.method === "CASH" && p.tenderedCents ? p.tenderedCents : p.amountCents)}
        />
      ))}
      {change > 0 && <Line label="Vuelto" value={formatMoney(change)} bold />}
      {payments.some((p) => p.method === "CREDIT") && (
        <div className="mt-1 text-center text-[12px]">Saldo en cuenta por cobrar a nombre de {order.customerName}</div>
      )}
      <hr className="my-2 border-dashed border-black" />
      <div className="text-center">{appConfig.ticket.footer}</div>
      <div className="text-center text-[11px]">Documento no válido como factura</div>
      <PrintOnLoad />
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-[16px] font-bold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
