import { notFound } from "next/navigation";

import { PrintOnLoad } from "@/components/print/print-on-load";
import { requirePermission } from "@/core/auth/server";
import { appConfig } from "@/core/config/app";
import { getTicket } from "@/modules/kitchen";

export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("es-BO", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: appConfig.timezone,
});

export default async function ImprimirComandaPage({ params }: PageProps<"/imprimir/comanda/[id]">) {
  await requirePermission("kitchen.view");
  const { id } = await params;
  const ticket = await getTicket(id);
  if (!ticket) notFound();

  return (
    <div>
      <div className="text-center text-[18px] font-bold">COMANDA #{ticket.orderNumber}</div>
      {ticket.sequence > 1 && <div className="text-center font-bold">*** ADICIONAL {ticket.sequence - 1} ***</div>}
      {ticket.status === "CANCELLED" && <div className="text-center text-[18px] font-bold">*** ANULADA ***</div>}
      <div className="text-center text-[16px] font-bold">{ticket.label}</div>
      <div className="text-center">{dateTime.format(ticket.receivedAt)}</div>
      <hr className="my-2 border-dashed border-black" />
      {ticket.items.map((item) => (
        <div key={item.id} className="mb-2">
          <div className="text-[16px] font-bold">
            {item.quantity} x {item.name}
            {item.voidedAt && " (ANULADO)"}
          </div>
          {item.serviceType === "TAKEAWAY" && ticket.serviceType === "DINE_IN" && <div>&gt;&gt; PARA LLEVAR</div>}
          {(item.modifiers as string[]).map((m) => (
            <div key={m}>&nbsp;&nbsp;- {m}</div>
          ))}
          {item.note && <div className="font-bold">&nbsp;&nbsp;NOTA: {item.note}</div>}
        </div>
      ))}
      <hr className="my-2 border-dashed border-black" />
      <PrintOnLoad />
    </div>
  );
}
