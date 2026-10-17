import { readFileSync } from "node:fs";
import path from "node:path";

import { hashPin } from "../src/core/auth/pin";
import type { PrismaClient } from "../src/generated/prisma/client";

/**
 * Datos iniciales. Se ejecuta en cada `docker compose up`, así que todo es idempotente:
 * - Usuarios y ajustes: solo se crean si no existen.
 * - Menú real de Delycia: se carga UNA sola vez (marca "seed.menuVersion"); después se
 *   administra desde Catálogo y reiniciar no pisa los cambios.
 * - Borra los productos de ejemplo de las primeras versiones ("(ejemplo)").
 */

type MenuFile = { platos: { plato: string; categoria: string; pvp_bs: number; va_a_cocina?: boolean }[] };

/** Categoría del archivo → pestaña en la pantalla de venta (las hamburguesas van juntas). */
const CATEGORY_MAP: Record<string, string> = {
  "Hamburguesa Clásica": "Hamburguesas",
  "Hamburguesa Suprema": "Hamburguesas",
  "Hamburguesa Ranchera": "Hamburguesas",
  "Hamburguesa BBQ": "Hamburguesas",
  "Hamburguesa Onion-String": "Hamburguesas",
  Milanesa: "Milanesas",
  "Sándwich": "Sándwiches",
  Lomito: "Lomitos",
  Salchipapa: "Salchipapas",
  Papas: "Papas",
  Piqueos: "Piqueos",
  Extras: "Extras",
  Bebidas: "Bebidas",
};

/** Orden de las pestañas en la pantalla de venta. */
const CATEGORIES = [
  "Hamburguesas",
  "Milanesas",
  "Sándwiches",
  "Lomitos",
  "Salchipapas",
  "Papas",
  "Piqueos",
  "Extras",
  "Bebidas",
];

const MENU_VERSION = 1;

export async function seedUsersAndSettings(db: PrismaClient) {
  // PIN de desarrollo: cámbialos antes de usar en el local.
  const users = [
    { name: "Admin", pin: "1234", role: "ADMIN" as const },
    { name: "Caja", pin: "1111", role: "CASHIER" as const },
    { name: "Cocina", pin: "2222", role: "KITCHEN" as const },
  ];
  for (const u of users) {
    const exists = await db.user.findUnique({ where: { name: u.name } });
    if (!exists) await db.user.create({ data: { name: u.name, role: u.role, pinHash: await hashPin(u.pin) } });
  }
  await db.setting.upsert({
    where: { key: "sales.peyaMarkupPercent" },
    create: { key: "sales.peyaMarkupPercent", value: 40 },
    update: {},
  });
}

/** Carga el menú real desde prisma/data/menu-delycia.json (solo la primera vez). */
export async function seedMenu(db: PrismaClient, { force = false } = {}) {
  const flag = await db.setting.findUnique({ where: { key: "seed.menuVersion" } });
  if (flag && !force) return { loaded: false };

  const file = path.join(__dirname, "data", "menu-delycia.json");
  const menu: MenuFile = JSON.parse(readFileSync(file, "utf8"));

  const categoryId: Record<string, string> = {};
  for (const [index, name] of CATEGORIES.entries()) {
    // Si la categoría ya existía (versiones de prueba), se reordena y se reactiva.
    const row = await db.category.upsert({
      where: { name },
      create: { name, sortOrder: index },
      update: { sortOrder: index, active: true },
    });
    categoryId[name] = row.id;
  }

  const position: Record<string, number> = {};
  for (const item of menu.platos) {
    const category = CATEGORY_MAP[item.categoria];
    if (!category) throw new Error(`Categoría sin mapear en el menú: "${item.categoria}"`);
    position[category] = (position[category] ?? -1) + 1;
    await db.product.upsert({
      where: { categoryId_name: { categoryId: categoryId[category], name: item.plato } },
      create: {
        categoryId: categoryId[category],
        name: item.plato,
        priceCents: Math.round(item.pvp_bs * 100),
        // Las bebidas no generan comanda.
        sendsToKitchen: item.va_a_cocina ?? true,
        sortOrder: position[category],
      },
      update: {},
    });
  }

  await db.setting.upsert({
    where: { key: "seed.menuVersion" },
    create: { key: "seed.menuVersion", value: MENU_VERSION },
    update: { value: MENU_VERSION },
  });
  return { loaded: true, products: menu.platos.length };
}

/** Quita los productos de ejemplo de versiones anteriores y las categorías que quedaron vacías. */
export async function removeExampleCatalog(db: PrismaClient) {
  // Las órdenes guardan copia del nombre y precio, así que borrar el producto no afecta el historial.
  await db.product.deleteMany({ where: { name: { endsWith: "(ejemplo)" } } });
  await db.category.deleteMany({ where: { name: { in: ["Platos"] }, products: { none: {} } } });
}

export async function seed(db: PrismaClient) {
  await seedUsersAndSettings(db);
  await removeExampleCatalog(db);
  return seedMenu(db);
}
