// Sin Decimal: se puede usar en componentes de cliente.
import type { StockMovementType } from "@/generated/prisma/enums";

export const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  INITIAL: "Inventario inicial",
  PURCHASE: "Compra",
  PURCHASE_REVERSAL: "Anulación de compra",
  PRODUCTION: "Ingreso a inventario",
  SALE: "Venta",
  SALE_REVERSAL: "Anulación de venta",
  ADJUSTMENT: "Ajuste por conteo",
  CONSUMPTION: "Salida rápida",
};

export type StockLevel = "negative" | "low" | "ok";

export const STOCK_LEVEL_LABEL: Record<StockLevel, string> = { negative: "Negativo", low: "Bajo el mínimo", ok: "OK" };
