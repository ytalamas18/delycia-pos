// Sin Decimal: se puede usar en componentes de cliente.
import type { MoneyAccount, PurchaseDocType, SupplierPaymentMethod } from "@/generated/prisma/enums";

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

/** Cuenta de origen por defecto según el método de pago (se puede cambiar en el formulario). */
export const DEFAULT_ACCOUNT_FOR_METHOD: Record<SupplierPaymentMethod, MoneyAccount> = {
  CASH: "CASH",
  TRANSFER: "BANK",
  CARD: "ATC_PEYA",
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

/** "Refrigerio" (sin importar mayúsculas, tildes ni espacios): el único ítem que pide aclarar qué se compró. */
const DETAIL_ITEM = "refrigerio";

export function needsDetail(itemName: string | null | undefined): boolean {
  return (
    (itemName ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim() === DETAIL_ITEM
  );
}

/** "Refrigerio: empanadas" o solo el nombre si no hay aclaración. */
export function lineLabel(line: { productName: string; detail?: string | null }): string {
  return line.detail ? `${line.productName}: ${line.detail}` : line.productName;
}
