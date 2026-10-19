import type { ItemType } from "@/generated/prisma/enums";

export type { ItemType };

export const ITEM_TYPES: ItemType[] = ["NORMAL", "PREPARED", "INGREDIENT", "SUPPLY"];

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  NORMAL: "Normal",
  PREPARED: "Preparado",
  INGREDIENT: "Ingrediente",
  SUPPLY: "Insumo",
};

export const ITEM_TYPE_PLURAL: Record<ItemType, string> = {
  NORMAL: "Normales",
  PREPARED: "Preparados",
  INGREDIENT: "Ingredientes",
  SUPPLY: "Insumos",
};

export const ITEM_TYPE_HINT: Record<ItemType, string> = {
  NORMAL: "Se vende tal cual (ej. gaseosa). Stock solo si se marca la compra.",
  PREPARED: "Se vende y se arma con receta (ej. hamburguesa). Descuenta los componentes; no tiene stock propio.",
  INGREDIENT: "Se produce en cocina (ej. carne de hamburguesa). No se vende. Siempre maneja stock.",
  SUPPLY: "Se compra (ej. carne molida, pan). No se vende. Stock solo si se marca la compra.",
};

/** Tipos que aparecen en la pantalla de venta. */
export const SELLABLE_TYPES: ItemType[] = ["NORMAL", "PREPARED"];
/** Tipos que se pueden comprar (Preparado nunca aparece en Compras). */
export const PURCHASABLE_TYPES: ItemType[] = ["NORMAL", "INGREDIENT", "SUPPLY"];

export const isSellable = (type: ItemType) => SELLABLE_TYPES.includes(type);

/** Si el ítem maneja stock según su tipo y el check "Suma al inventario al registrar compra". */
export function tracksStockFor(type: ItemType, checked: boolean): boolean {
  if (type === "PREPARED") return false;
  if (type === "INGREDIENT") return true;
  return checked;
}
