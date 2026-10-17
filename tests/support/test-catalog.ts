import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Catálogo fijo para los tests (no depende del menú real, que puede cambiar).
 * Incluye bebidas que NO van a cocina y modificadores con y sin costo.
 */
export async function seedTestCatalog(db: PrismaClient) {
  const platos = await db.category.upsert({ where: { name: "Test Platos" }, create: { name: "Test Platos", sortOrder: 90 }, update: {} });
  const bebidas = await db.category.upsert({ where: { name: "Test Bebidas" }, create: { name: "Test Bebidas", sortOrder: 91 }, update: {} });
  const extras = await db.category.upsert({ where: { name: "Test Extras" }, create: { name: "Test Extras", sortOrder: 92 }, update: {} });

  const products = [
    { categoryId: platos.id, name: "Majadito (ejemplo)", priceCents: 3800, sendsToKitchen: true, modifiers: [
      { name: "Sin cebolla", priceDeltaCents: 0 },
      { name: "Sin ensalada", priceDeltaCents: 0 },
      { name: "Extra huevo", priceDeltaCents: 500 },
    ] },
    { categoryId: platos.id, name: "Salchipapa de pollo (ejemplo)", priceCents: 3000, sendsToKitchen: true, modifiers: [] },
    { categoryId: bebidas.id, name: "Gaseosa 500 ml (ejemplo)", priceCents: 1000, sendsToKitchen: false, modifiers: [] },
    { categoryId: bebidas.id, name: "Agua 500 ml (ejemplo)", priceCents: 600, sendsToKitchen: false, modifiers: [] },
    { categoryId: extras.id, name: "Porción de papas (ejemplo)", priceCents: 1000, sendsToKitchen: true, modifiers: [] },
  ];
  for (const [i, p] of products.entries()) {
    const { modifiers, ...data } = p;
    await db.product.create({
      data: { ...data, sortOrder: i, modifiers: { create: modifiers.map((m, j) => ({ ...m, sortOrder: j })) } },
    });
  }
}
