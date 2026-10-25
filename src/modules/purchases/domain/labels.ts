// Sin Decimal: se puede usar en componentes de cliente.
import type { PurchaseDocType, SupplierPaymentMethod } from "@/generated/prisma/enums";

export const DOC_TYPE_LABEL: Record<PurchaseDocType, string> = {
  RECEIPT: "Boleta / nota",
  INVOICE: "Factura",
  NONE: "Sin comprobante",
};

export const SUPPLIER_METHOD_LABEL: Record<SupplierPaymentMethod, string> = {
  CASH: "Efectivo",
  TRANSFER: "Transferencia / QR",
  CARD: "Tarjeta",
};

export type PaymentStatus = "PENDING" | "PARTIAL" | "PAID";

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  PAID: "Pagada",
};

/** Cómo se paga al registrar la compra. */
export type PaymentMode = "CASH_FULL" | "CREDIT" | "PARTIAL";

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  CASH_FULL: "Contado",
  CREDIT: "Crédito (no se paga ahora)",
  PARTIAL: "Pago parcial",
};
