import { Badge } from "@/components/ui/badge";

import { PAYMENT_STATUS_LABEL, type PaymentStatus } from "../domain/labels";

const STYLE: Record<PaymentStatus, string> = {
  PENDING: "bg-red-600 text-white",
  PARTIAL: "bg-yellow-300 text-black",
  PAID: "bg-green-600 text-white",
};

export function PurchaseStatusBadge({ status, cancelled, overdue }: { status: PaymentStatus; cancelled?: boolean; overdue?: boolean }) {
  if (cancelled) return <Badge variant="secondary">Anulada</Badge>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge className={STYLE[status]}>{PAYMENT_STATUS_LABEL[status]}</Badge>
      {overdue && <Badge className="bg-red-700 text-white">Vencida</Badge>}
    </span>
  );
}
