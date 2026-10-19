import { db } from "@/core/db/client";

import { SELLABLE_TYPES } from "../domain/item-types";

export type SellableProduct = {
  id: string;
  name: string;
  priceCents: number;
  sendsToKitchen: boolean;
  modifiers: { id: string; name: string; priceDeltaCents: number }[];
};

export type SellableCategory = { id: string; name: string; products: SellableProduct[] };

/**
 * Lo que se puede vender ahora: categorías y productos activos de tipo Normal o Preparado, en el orden configurado.
 * Es lo que consume Ventas (pantalla POS) a través de la API pública del catálogo.
 */
export async function getSellableCatalog(): Promise<SellableCategory[]> {
  const categories = await db.category.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      products: {
        // Ingredientes e Insumos no se venden.
        where: { active: true, type: { in: SELLABLE_TYPES } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          priceCents: true,
          sendsToKitchen: true,
          modifiers: {
            where: { active: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            select: { id: true, name: true, priceDeltaCents: true },
          },
        },
      },
    },
  });
  return categories.filter((c) => c.products.length > 0);
}

/** Datos de un producto activo para venderlo (Ventas los copia en la orden). */
export async function getSellableProduct(id: string): Promise<SellableProduct | null> {
  return db.product.findFirst({
    where: { id, active: true, type: { in: SELLABLE_TYPES }, category: { active: true } },
    select: {
      id: true,
      name: true,
      priceCents: true,
      sendsToKitchen: true,
      modifiers: {
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, priceDeltaCents: true },
      },
    },
  });
}
