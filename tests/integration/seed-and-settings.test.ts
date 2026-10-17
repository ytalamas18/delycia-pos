import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { verifyPin } from "@/core/auth/pin";
import { db, disconnectDb } from "@/core/db/client";
import { getSetting, setSetting } from "@/core/settings";
import { kdsThresholdsSetting } from "@/modules/kitchen";
import { peyaMarkupSetting } from "@/modules/sales";

import { seed } from "../../prisma/seed-data";
import { resetDatabase } from "../support/db";

describe("seed y ajustes", () => {
  beforeAll(async () => {
    await resetDatabase();
    await seed(db);
  });
  afterAll(disconnectDb);

  it("carga usuarios con PIN hasheado", async () => {
    const caja = await db.user.findUniqueOrThrow({ where: { name: "Caja" } });
    expect(caja.pinHash).not.toBe("1111");
    expect(await verifyPin("1111", caja.pinHash)).toBe(true);
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
    const extras = await db.product.findMany({ where: { category: { name: "Extras" } }, orderBy: { sortOrder: "asc" } });
    expect(extras.map((p) => [p.name, p.priceCents])).toEqual([
      ["Extra huevo", 300],
      ["Extra tocino", 500],
      ["Extra queso", 300],
    ]);
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
    expect(await seed(db)).toEqual({ loaded: false });
    expect(await db.product.count({ where: { name: "Lomito Simple" } })).toBe(0);
    expect(await db.product.count()).toBe(55);
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
