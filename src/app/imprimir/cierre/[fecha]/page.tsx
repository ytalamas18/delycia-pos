import { notFound } from "next/navigation";

import { PrintOnLoad } from "@/components/print/print-on-load";
import { requirePermission } from "@/core/auth/server";
import { appConfig } from "@/core/config/app";
import { formatMoney } from "@/core/money";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { getDailyClosing, paymentMethodLabel } from "@/modules/sales";

export const dynamic = "force-dynamic";

const METHODS: PaymentMethod[] = ["CASH", "QR", "CARD", "PEYA", "CREDIT"];
const dateTime = new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short", timeZone: appConfig.timezone });

export default async function ImprimirCierrePage({ params }: PageProps<"/imprimir/cierre/[fecha]">) {
  await requirePermission("cash.close");
  const { fecha } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) notFound();
  const { summary: s, saved, closedByName } = await getDailyClosing(fecha);

  return (
    <div>
      <div className="text-center text-[18px] font-bold">CIERRE DE CAJA</div>
      <div className="text-center">{appConfig.businessName} · {fecha.split("-").reverse().join("/")}</div>
      <hr className="my-2 border-dashed border-black" />
      <L label="Órdenes cobradas" value={String(s.paidCount)} />
      <L label="Ventas brutas" value={formatMoney(s.grossCents)} />
      <L label="Descuentos" value={`-${formatMoney(s.discountCents)}`} />
      <L label="VENTAS NETAS" value={formatMoney(s.netCents)} bold />
      <L label="Ticket promedio" value={formatMoney(s.averageTicketCents)} />
      {s.openCount > 0 && <L label={`Por pagar (${s.openCount})`} value={formatMoney(s.openTotalCents)} />}
      <hr className="my-2 border-dashed border-black" />
      <div className="font-bold">Ventas por medio</div>
      {METHODS.map((m) => (
        <L key={m} label={paymentMethodLabel[m]} value={formatMoney(s.salesByMethod[m])} />
      ))}
      {s.collectionsTotalCents > 0 && (
        <>
          <div className="mt-1 font-bold">Cobros de fiados</div>
          {METHODS.filter((m) => s.collectionsByMethod[m] > 0).map((m) => (
            <L key={m} label={paymentMethodLabel[m]} value={formatMoney(s.collectionsByMethod[m])} />
          ))}
        </>
      )}
      <hr className="my-2 border-dashed border-black" />
      <L label="Local" value={formatMoney(s.byChannel.LOCAL.netCents)} />
      <L label="PEYA" value={formatMoney(s.byChannel.PEYA.netCents)} />
      {saved && (
        <>
          <hr className="my-2 border-dashed border-black" />
          <div className="font-bold">Arqueo</div>
          <L label="Fondo inicial" value={formatMoney(saved.openingCashCents)} />
          <L label="Efectivo esperado" value={formatMoney(saved.expectedCashCents)} />
          <L label="Efectivo contado" value={formatMoney(saved.countedCashCents)} />
          <Diff label="Efectivo" diff={saved.differenceCents} />
          {saved.countedQrCents !== null && (
            <>
              <L label="QR sistema / banco" value={`${formatMoney(saved.expectedQrCents)} / ${formatMoney(saved.countedQrCents)}`} />
              <Diff label="QR" diff={saved.countedQrCents - saved.expectedQrCents} />
            </>
          )}
          {saved.countedCardCents !== null && (
            <>
              <L
                label="Tarjeta sistema / datáfono"
                value={`${formatMoney(saved.expectedCardCents)} / ${formatMoney(saved.countedCardCents)}`}
              />
              <Diff label="Tarjeta" diff={saved.countedCardCents - saved.expectedCardCents} />
            </>
          )}
          {saved.notes && <div className="mt-1">Obs.: {saved.notes}</div>}
          <div className="mt-1 text-[12px]">
            Cerró {closedByName} · {dateTime.format(saved.closedAt)}
          </div>
        </>
      )}
      <hr className="my-2 border-dashed border-black" />
      <div className="font-bold">Productos</div>
      {s.products.map((p) => (
        <L key={p.name} label={`${p.quantity} x ${p.name}`} value={formatMoney(p.amountCents)} />
      ))}
      <PrintOnLoad />
    </div>
  );
}

function Diff({ label, diff }: { label: string; diff: number }) {
  return (
    <L
      label={`${label}: ${diff === 0 ? "cuadra" : diff < 0 ? "FALTA" : "SOBRA"}`}
      value={diff === 0 ? "✔" : formatMoney(Math.abs(diff))}
      bold
    />
  );
}

function L({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}>
      <span>{label}</span>
      <span className="whitespace-nowrap">{value}</span>
    </div>
  );
}
