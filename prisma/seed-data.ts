import { hashPin } from "../src/core/auth/pin";
import type { PrismaClient } from "../src/generated/prisma/client";

/**
 * Datos de ejemplo. Los productos son PROVISORIOS (marcados "ejemplo") hasta cargar
 * los platos reales de Delycia. Es idempotente: se puede correr varias veces.
 */
export async function seed(db: PrismaClient) {
  // --- Usuarios (PIN de desarrollo: cámbialos antes de usar en el local) ---
  const users = [
    { name: "Admin", pin: "1234", role: "ADMIN" as const },
    { name: "Caja", pin: "1111", role: "CASHIER" as const },
    { name: "Cocina", pin: "2222", role: "KITCHEN" as const },
  ];
  for (const u of users) {
    const exists = await db.user.findUnique({ where: { name: u.name } });
    if (!exists) await db.user.create({ data: { name: u.name, role: u.role, pinHash: await hashPin(u.pin) } });
  }

  // --- Ajustes ---
  await db.setting.upsert({
    where: { key: "sales.peyaMarkupPercent" },
    create: { key: "sales.peyaMarkupPercent", value: 40 },
    update: {},
  });

  // --- Catálogo ---
  const categories = [
    { name: "Platos", sortOrder: 1 },
    { name: "Bebidas", sortOrder: 2 },
    { name: "Extras", sortOrder: 3 },
  ];
  const categoryId: Record<string, string> = {};
  for (const c of categories) {
    const row = await db.category.upsert({ where: { name: c.name }, create: c, update: {} });
    categoryId[c.name] = row.id;
  }

  const products = [
    {
      category: "Platos",
      name: "Majadito (ejemplo)",
      priceCents: 3800,
      sendsToKitchen: true,
      modifiers: [
        { name: "Sin cebolla", priceDeltaCents: 0 },
        { name: "Sin ensalada", priceDeltaCents: 0 },
        { name: "Extra huevo", priceDeltaCents: 500 },
      ],
    },
    {
      category: "Platos",
      name: "Salchipapa de pollo (ejemplo)",
      priceCents: 3000,
      sendsToKitchen: true,
      modifiers: [
        { name: "Sin mayonesa", priceDeltaCents: 0 },
        { name: "Sin picante", priceDeltaCents: 0 },
      ],
    },
    { category: "Bebidas", name: "Gaseosa 500 ml (ejemplo)", priceCents: 1000, sendsToKitchen: false, modifiers: [] },
    { category: "Bebidas", name: "Agua 500 ml (ejemplo)", priceCents: 600, sendsToKitchen: false, modifiers: [] },
    { category: "Extras", name: "Porción de papas (ejemplo)", priceCents: 1000, sendsToKitchen: true, modifiers: [] },
  ];

  for (const [index, p] of products.entries()) {
    const product = await db.product.upsert({
      where: { categoryId_name: { categoryId: categoryId[p.category], name: p.name } },
      create: {
        categoryId: categoryId[p.category],
        name: p.name,
        priceCents: p.priceCents,
        sendsToKitchen: p.sendsToKitchen,
        sortOrder: index,
      },
      update: {},
    });
    for (const [mIndex, m] of p.modifiers.entries()) {
      await db.productModifier.upsert({
        where: { productId_name: { productId: product.id, name: m.name } },
        create: { productId: product.id, ...m, sortOrder: mIndex },
        update: {},
      });
    }
  }
}
