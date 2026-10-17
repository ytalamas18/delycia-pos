import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { verifyPin } from "@/core/auth/pin";
import { db, disconnectDb } from "@/core/db/client";
import { getSetting, setSetting } from "@/core/settings";
import { kdsThresholdsSetting } from "@/modules/kitchen";
import { peyaMarkupSetting } from "@/modules/sales";

import { applyMenuUpdates, seed } from "../../prisma/seed-data";
import { resetDatabase } from "../support/db";

describe("seed y ajustes", () => {
  beforeAll(async () => {
    await resetDatabase();
    await seed(db, { Caja: "4827" });
  });
  afterAll(disconnectDb);

  it("carga usuarios con PIN hasheado", async () => {
    const caja = await db.user.findUniqueOrThrow({ where: { name: "Caja" } });
    expect(caja.pinHash).not.toBe("4827");
    expect(await verifyPin("4827", caja.pinHash)).toBe(true);
    expect(await db.user.count()).toBe(3);
  });

  it("carga el menú real de Delycia (platos, extras y bebidas que no van a cocina)", async () => {
    expect(await db.product.count()).toBe(55);
    const clasica = await db.product.findFirstOrThrow({ where: { name: "Hamburguesa Clásica Simple" }, include: { category: true } });
    expect(clasica).toMatchObject({ priceCents: 4000, sendsToKitchen: true, category: { name: "Hamburguesas" } });
    const piqueo = await db.product.findFirstOrThrow({ where: { name: "Piqueo Familiar" } });
    expect(piqueo.priceCents).toBe(17500);
    expect(await db.product.count({ where: { category: { name: "Hamburguesas" } } })).toBe(15);
    expect(await db.product.count({ where: { name: "Nachos Supremos" } })).toBe(0);
    // Extras: ya no se venden sueltos (actualización v2), son modificadores de hamburguesas y lomitos.
    const extras = await db.product.findMany({ where: { category: { name: "Extras" } }, orderBy: { sortOrder: "asc" } });
    expect(extras.map((p) => [p.name, p.priceCents, p.active])).toEqual([
      ["Extra huevo", 300, false],
      ["Extra tocino", 500, false],
      ["Extra queso", 300, false],
    ]);
    expect((await db.category.findUniqueOrThrow({ where: { name: "Extras" } })).active).toBe(false);
    for (const name of ["Hamburguesa BBQ Doble", "Lomito Especial"]) {
      const p = await db.product.findFirstOrThrow({ where: { name }, include: { modifiers: { orderBy: { sortOrder: "asc" } } } });
      expect(p.modifiers.map((m) => [m.name, m.priceDeltaCents])).toEqual([
        ["Extra huevo", 300],
        ["Extra tocino", 500],
        ["Extra queso", 300],
      ]);
    }
    const milanesa = await db.product.findFirstOrThrow({ where: { name: "Milanesa Picada Pollo" }, include: { modifiers: true } });
    expect(milanesa.modifiers).toEqual([]);
    const bebidas = await db.product.findMany({ where: { category: { name: "Bebidas" } } });
    expect(bebidas).toHaveLength(21);
    expect(bebidas.every((b) => !b.sendsToKitchen)).toBe(true);
    expect(bebidas.find((b) => b.name === "Simba Durazno 2 L")?.priceCents).toBe(1600);
    expect((await db.category.findMany({ orderBy: { sortOrder: "asc" } })).map((c) => c.name)).toEqual([
      "Hamburguesas", "Milanesas", "Sándwiches", "Lomitos", "Salchipapas", "Papas", "Piqueos", "Extras", "Bebidas",
    ]);
  });

  it("el menú se carga una sola vez: reiniciar no pisa cambios hechos desde Catálogo", async () => {
    await db.product.updateMany({ where: { name: "Lomito Simple" }, data: { priceCents: 3600, name: "Lomito Clásico" } });
    expect(await seed(db)).toEqual({ loaded: false, updates: [], users: [] });
    expect(await db.product.count({ where: { name: "Lomito Simple" } })).toBe(0);
    expect(await db.product.count()).toBe(55);
  });

  it("una base que ya tenía el menú v1 recibe la actualización v2 una sola vez", async () => {
    // Simula una instalación anterior: versión 1, mensajes rápidos guardados y una hamburguesa sin extras.
    await db.setting.update({ where: { key: "seed.menuVersion" }, data: { value: 1 } });
    await db.setting.upsert({
      where: { key: "kitchen.quickMessages" },
      create: { key: "kitchen.quickMessages", value: ["LLEGÓ GENTE", "DESCONGELEN PRODUCTO", "MÁS PAPA"] },
      update: { value: ["LLEGÓ GENTE", "DESCONGELEN PRODUCTO", "MÁS PAPA"] },
    });
    const burger = await db.product.findFirstOrThrow({ where: { name: "Hamburguesa Clásica Simple" } });
    await db.productModifier.deleteMany({ where: { productId: burger.id, name: "Extra tocino" } });

    expect(await applyMenuUpdates(db)).toHaveLength(1);
    expect(await applyMenuUpdates(db)).toEqual([]); // segunda vez: nada

    expect((await db.setting.findUniqueOrThrow({ where: { key: "kitchen.quickMessages" } })).value).toEqual([
      "LLEGÓ GENTE",
      "MÁS PAPA",
    ]);
    const mods = await db.productModifier.findMany({ where: { productId: burger.id } });
    expect(mods.map((m) => m.name).sort()).toEqual(["Extra huevo", "Extra queso", "Extra tocino"]); // sin duplicados
  });

  it("borra los productos de ejemplo de versiones anteriores", async () => {
    const cat = await db.category.create({ data: { name: "Platos" } });
    await db.product.create({ data: { name: "Majadito (ejemplo)", categoryId: cat.id, priceCents: 3800 } });
    await seed(db);
    expect(await db.product.count({ where: { name: { endsWith: "(ejemplo)" } } })).toBe(0);
    expect(await db.category.count({ where: { name: "Platos" } })).toBe(0);
  });

  it("el % PEYA viene del seed y se puede cambiar", async () => {
    expect(await getSetting(peyaMarkupSetting)).toBe(40);
    await setSetting(peyaMarkupSetting, 35);
    expect(await getSetting(peyaMarkupSetting)).toBe(35);
  });

  it("un ajuste sin guardar devuelve su valor por defecto; uno inválido se rechaza", async () => {
    expect(await getSetting(kdsThresholdsSetting)).toEqual({ warnAfterMinutes: 10, dangerAfterMinutes: 20 });
    await expect(setSetting(kdsThresholdsSetting, { warnAfterMinutes: 20, dangerAfterMinutes: 10 })).rejects.toThrow();
  });
});

describe("seed de producción sin menú (SEED_MENU=false)", () => {
  beforeAll(resetDatabase);
  afterAll(disconnectDb);

  it("crea usuarios y ajustes pero ningún producto", async () => {
    const result = await seed(db, {}, { menu: false });
    expect(result).toMatchObject({ loaded: false, updates: [] });
    expect(await db.user.count()).toBe(3);
    expect(await db.product.count()).toBe(0);
    expect(await db.setting.findUnique({ where: { key: "seed.menuVersion" } })).toBeNull();
  });
});
