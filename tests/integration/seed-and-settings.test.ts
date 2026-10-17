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
    await seed(db); // idempotente: correrlo dos veces no duplica nada
  });
  afterAll(disconnectDb);

  it("carga usuarios con PIN hasheado", async () => {
    const caja = await db.user.findUniqueOrThrow({ where: { name: "Caja" } });
    expect(caja.pinHash).not.toBe("1111");
    expect(await verifyPin("1111", caja.pinHash)).toBe(true);
    expect(await db.user.count()).toBe(3);
  });

  it("incluye bebidas que NO van a cocina", async () => {
    const bebidas = await db.product.findMany({ where: { category: { name: "Bebidas" } } });
    expect(bebidas.length).toBeGreaterThan(0);
    expect(bebidas.every((p) => !p.sendsToKitchen)).toBe(true);
    expect(await db.product.count()).toBe(5);
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
