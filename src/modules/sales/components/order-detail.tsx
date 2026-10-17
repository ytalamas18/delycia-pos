import { Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { appConfig } from "@/core/config/app";
import { formatMoney } from "@/core/money";
import { listTicketsForOrder, ticketStatusLabel } from "@/modules/kitchen";

import { orderLabel, orderStatusLabel, paymentMethodLabel, serviceTypeLabel } from "../domain/labels";
import { getOrderDetail } from "../services/history";

const time = new Intl.DateTimeFormat("es-BO", { hour: "2-digit", minute: "2-digit", timeZone: appConfig.timezone });
const minutesBetween = (a: Date | null, b: Date | null) =>
  a && b ? `${Math.round((b.getTime() - a.getTime()) / 60_000)} min` : "—";

export async function OrderDetail({ id }: { id: string }) {
  const order = await getOrderDetail(id);
  if (!order) notFound();
  const tickets = await listTicketsForOrder(order.id);

  return (
    <div className="max-w-3xl space-y-4">
      <Link href={`/historial?fecha=${order.businessDate}`} className="text-sm text-muted-foreground hover:underline">
        ← Volver al historial
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Orden #{order.number}</h1>
          <p className="text-lg">
            {orderLabel(order)} · {serviceTypeLabel[order.serviceType]}
          </p>
          <p className="text-sm text-muted-foreground">
            Abierta {time.format(order.openedAt)} por {order.createdBy.name}
            {order.paidAt && ` · cobrada ${time.format(order.paidAt)}`}
            {order.closedAt && ` · cerrada ${time.format(order.closedAt)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="text-base">{orderStatusLabel[order.status]}</Badge>
          {order.status === "OPEN" && (
            <Button asChild>
              <Link href={`/pos?orden=${order.id}`}>Abrir para cobrar</Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <a href={`/imprimir/ticket/${order.id}`} target="_blank" rel="noreferrer">
              <Printer /> Ticket
            </a>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Productos</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {order.items.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 py-2">
                <div className={i.status === "VOIDED" ? "line-through opacity-60" : ""}>
                  <div className="font-medium">
                    {i.quantity}× {i.productName}
                    {i.serviceType !== order.serviceType && ` (${serviceTypeLabel[i.serviceType].toLowerCase()})`}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {[...(i.modifiers as { name: string }[]).map((m) => m.name), i.note].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className="tabular-nums">{formatMoney(i.unitPriceCents * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t pt-3">
            <Row label="Subtotal" value={formatMoney(order.subtotalCents)} />
            {order.discountCents > 0 && (
              <Row
                label={`Descuento${order.discountType === "PERCENT" ? ` (${Number(order.discountValue)} %)` : ""}`}
                value={`− ${formatMoney(order.discountCents)}`}
              />
            )}
            <Row label="Total" value={formatMoney(order.totalCents)} strong />
          </div>
        </CardContent>
      </Card>

      {order.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pagos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {order.payments.map((p) => (
              <div key={p.id}>
                <Row
                  label={`${paymentMethodLabel[p.method]}${p.method === "CREDIT" ? ` (${p.debtorName})` : ""}${p.refundedAt ? " — devuelto" : ""}`}
                  value={formatMoney(p.amountCents)}
                />
                {p.tenderedCents !== null && (
                  <div className="pl-4 text-sm text-muted-foreground">
                    Recibido {formatMoney(p.tenderedCents)} · vuelto {formatMoney(p.changeCents ?? 0)}
                  </div>
                )}
                {p.method === "CREDIT" && (
                  <div className="pl-4 text-sm text-muted-foreground">
                    {p.settledAt
                      ? "Saldada"
                      : `Pendiente: ${formatMoney(p.amountCents - p.collections.reduce((s, c) => s + c.amountCents, 0))}`}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tickets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cocina</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1">Comanda</th>
                  <th>Entró</th>
                  <th>Espera</th>
                  <th>Preparación</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="py-1.5">{t.sequence === 1 ? "Original" : `Adicional ${t.sequence - 1}`}</td>
                    <td>{time.format(t.receivedAt)}</td>
                    <td>{minutesBetween(t.receivedAt, t.startedAt)}</td>
                    <td>{minutesBetween(t.startedAt ?? t.receivedAt, t.readyAt)}</td>
                    <td>{ticketStatusLabel[t.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? "text-xl font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
