import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, disconnectDb } from "@/core/db/client";
import { eventBus } from "@/core/db/transaction";
import { resetProductGuards } from "@/core/hooks/product-guards";
import { Decimal } from "@/core/quantity";
import { businessDate } from "@/core/time";
import { inventoryModule, stockAlerts, stockByProduct, stockLevel, withRunningBalance } from "@/modules/inventory";
import { kitchenModule } from "@/modules/kitchen";
import { salesModule } from "@/modules/sales";

import * as products from "@/modules/catalog/services/products";
import * as recipes from "@/modules/catalog/services/recipes";
import * as ops from "@/modules/inventory/services/operations";
import * as purchases from "@/modules/purchases/services/purchases";
import * as checkout from "@/modules/sales/services/checkout";
import * as orders from "@/modules/sales/services/orders";
import * as voids from "@/modules/sales/services/voids";

import { resetDatabase } from "../support/db";
import { createTestUser } from "../support/users";

const today = businessDate();
const line = (productId: string, extra: Record<string, unknown> = {}) => ({
  productId,
  quantity: 1,
  modifierIds: [] as string[],
  note: "",
  serviceType: "DINE_IN" as const,
  ...extra,
});

beforeEach(async () => {
  eventBus.reset();
  resetProductGuards();
  kitchenModule.registerSubscribers?.();
  salesModule.registerSubscribers?.();
  inventoryModule.registerSubscribers?.();
  await resetDatabase();
});
afterAll(async () => {
  eventBus.reset();
  await disconnectDb();
});

async function setup() {
  const user = await createTestUser(db);
  const cat = await db.category.create({ data: { name: "Varios" } });
  const base = { categoryId: cat.id, active: true };
  const burger = await products.createProduct({ ...base, name: "Hamburguesa", type: "PREPARED", priceCents: "40", sendsToKitchen: true });
  const medallon = await products.createProduct({ ...base, name: "Medallón", type: "INGREDIENT", sendsToKitchen: false, lastCostCents: "6,5" });
  const pan = await products.createProduct({ ...base, name: "Pan", type: "SUPPLY", tracksStock: true, minStock: "10", sendsToKitchen: false, lastCostCents: "1,5" });
  const caja = await products.createProduct({ ...base, name: "Caja", type: "SUPPLY", tracksStock: true, sendsToKitchen: false });
  const sal = await products.createProduct({ ...base, name: "Sal", type: "SUPPLY", baseUnit: "G", sendsToKitchen: false }); // sin stock
  const queso = await products.createProduct({ ...base, name: "Queso", type: "SUPPLY", baseUnit: "G", tracksStock: true, sendsToKitchen: false });
  const coca = await products.createProduct({ ...base, name: "Coca", type: "NORMAL", priceCents: "6", tracksStock: true, sendsToKitchen: false });
  await recipes.setRecipeLine(burger.id, { componentId: medallon.id, quantity: "1" });
  await recipes.setRecipeLine(burger.id, { componentId: pan.id, quantity: "1" });
  await recipes.setRecipeLine(burger.id, { componentId: sal.id, quantity: "2" });
  await recipes.setRecipeLine(burger.id, { componentId: caja.id, quantity: "1", condition: "TAKEAWAY" });
  const extra = await products.addModifier(burger.id, { name: "Extra queso", priceDeltaCents: "3" });
  await recipes.setModifierRecipeLine(extra.id, { componentId: queso.id, quantity: "30" });
  return { user, cat, burger, medallon, pan, caja, sal, queso, coca, extra };
}

async function stock(...ids: string[]) {
  const map = await stockByProduct(ids);
  return ids.map((id) => (map.get(id) ?? new Decimal(0)).toString());
}

describe("inventario (cálculo)", () => {
  it("nivel de stock y saldo acumulado", () => {
    expect(stockLevel(new Decimal(-1), null)).toBe("negative");
    expect(stockLevel(new Decimal(5), new Decimal(10))).toBe("low");
    expect(stockLevel(new Decimal(10), new Decimal(10))).toBe("ok");
    const k = withRunningBalance([{ quantity: new Decimal(24) }, { quantity: new Decimal(-3) }], new Decimal(1));
    expect(k.map((m) => m.balance.toString())).toEqual(["25", "22"]);
  });
});

describe("inventario (movimientos)", () => {
  it("compra suma stock y anularla lo revierte", async () => {
    const { user, pan } = await setup();
    const p = await purchases.createPurchase(
      { date: today, paymentMode: "CREDIT", supplierId: (await db.supplier.create({ data: { name: "Sol" } })).id, lines: [{ productId: pan.id, presentation: "unit:UNIT", quantity: "24", totalCents: "36" }] },
      user.id,
    );
    expect(await stock(pan.id)).toEqual(["24"]);
    await purchases.cancelPurchase(p.id, "Error de carga", user.id);
    expect(await stock(pan.id)).toEqual(["0"]);
  });

  it("venta: descuenta por receta ignorando lo sin stock; para llevar suma la caja; modificador descuenta", async () => {
    const { user, burger, medallon, pan, caja, sal, queso, extra } = await setup();
    const o = await orders.createOrder(
      { channel: "LOCAL", serviceType: "TAKEAWAY", customerName: "Ana" },
      [line(burger.id, { quantity: 2, serviceType: "TAKEAWAY", modifierIds: [extra.id] })],
      user.id,
    );
    await orders.sendToKitchen(o.id);
    expect(await stock(medallon.id, pan.id, caja.id, sal.id, queso.id)).toEqual(["-2", "-2", "-2", "0", "-60"]);
    // Cobrar después no vuelve a descontar.
    await checkout.payOrder(o.id, { discount: null, entries: [{ method: "CASH", amountCents: 8600 }] }, user.id);
    expect(await stock(medallon.id, pan.id)).toEqual(["-2", "-2"]);
    expect((await stockAlerts()).negative).toBeGreaterThanOrEqual(3);
  });

  it("comer aquí no usa la caja; PEYA cuenta como para llevar", async () => {
    const { user, burger, caja } = await setup();
    const local = await orders.createOrder({ channel: "LOCAL", serviceType: "DINE_IN", tableNumber: "2" }, [line(burger.id)], user.id);
    await orders.sendToKitchen(local.id);
    expect(await stock(caja.id)).toEqual(["0"]);
    const peya = await orders.createOrder({ channel: "PEYA", serviceType: "TAKEAWAY", customerName: "Luis" }, [line(burger.id, { serviceType: "DINE_IN" })], user.id);
    await orders.sendToKitchen(peya.id);
    expect(await stock(caja.id)).toEqual(["-1"]);
  });

  it("un Normal con stock (gaseosa) que no va a cocina descuenta al cobrar", async () => {
    const { user, coca } = await setup();
    const o = await orders.createOrder({ channel: "LOCAL", serviceType: "DINE_IN", tableNumber: "1" }, [line(coca.id, { quantity: 3 })], user.id);
    expect(await stock(coca.id)).toEqual(["0"]);
    await checkout.payOrder(o.id, { discount: null, entries: [{ method: "CASH", amountCents: 1800 }] }, user.id);
    expect(await stock(coca.id)).toEqual(["-3"]);
  });

  it("anular un ítem o la orden revierte lo descontado (una sola vez)", async () => {
    const { user, burger, pan, coca } = await setup();
    const actor = { userId: user.id, authorizedById: user.id };
    const o = await orders.createOrder({ channel: "LOCAL", serviceType: "DINE_IN", tableNumber: "1" }, [line(burger.id), line(burger.id, { note: "bien cocida" })], user.id);
    await orders.sendToKitchen(o.id);
    expect(await stock(pan.id)).toEqual(["-2"]);
    const [first] = (await orders.getOrder(o.id))!.items;
    await voids.voidItem(o.id, first.id, "Error al cargar", actor);
    expect(await stock(pan.id)).toEqual(["-1"]);
    await voids.cancelOrder(o.id, "Cliente se fue", actor);
    expect(await stock(pan.id)).toEqual(["0"]);

    const paid = await orders.createOrder({ channel: "LOCAL", serviceType: "DINE_IN", tableNumber: "1" }, [line(coca.id)], user.id);
    await checkout.payOrder(paid.id, { discount: null, entries: [{ method: "CASH", amountCents: 600 }] }, user.id);
    await voids.cancelOrder(paid.id, "Se cobró mal", actor);
    expect(await stock(coca.id)).toEqual(["0"]);
  });

  it("ingreso a inventario usa el costo de la receta y actualiza el último costo", async () => {
    const { user, medallon } = await setup();
    const carne = await products.createProduct({ name: "Carne", categoryId: (await db.category.findFirstOrThrow()).id, type: "SUPPLY", baseUnit: "KG", tracksStock: true, lastCostCents: "52", sendsToKitchen: false, active: true });
    await recipes.setRecipeLine(medallon.id, { componentId: carne.id, quantity: "2" });
    await recipes.setRecipeYield(medallon.id, { recipeYield: "16" });
    const e = await ops.createProduction({ productId: medallon.id, quantity: "16", date: today }, user.id);
    expect(e.unitCostCents?.toString()).toBe("650");
    expect(await stock(medallon.id)).toEqual(["16"]);
    const custom = await ops.createProduction({ productId: medallon.id, quantity: "4", date: today, unitCost: "7" }, user.id);
    expect(custom.unitCostCents?.toString()).toBe("700");
    expect((await db.product.findUniqueOrThrow({ where: { id: medallon.id } })).lastCostCents?.toString()).toBe("700");
    await expect(ops.createProduction({ productId: carne.id, quantity: "1", date: today }, user.id)).rejects.toThrow("Ingrediente");
  });

  it("conteo físico registra merma y sobrante como ajuste", async () => {
    const { user, pan, queso } = await setup();
    await db.stockMovement.create({ data: { productId: pan.id, type: "INITIAL", quantity: 20, businessDate: today, refType: "INITIAL", refId: "x" } });
    const count = await ops.createCount(
      { date: today, lines: [{ productId: pan.id, counted: "17", reason: "Se quemaron" }, { productId: queso.id, counted: "100" }] },
      user.id,
    );
    expect(count.lines.map((l) => [l.productName, l.difference.toString()])).toEqual([
      ["Pan", "-3"],
      ["Queso", "100"],
    ]);
    expect(await stock(pan.id, queso.id)).toEqual(["17", "100"]);
    expect((await stockAlerts()).low).toBe(0);
    await expect(ops.createCount({ date: today, lines: [{ productId: (await db.product.findFirstOrThrow({ where: { name: "Sal" } })).id, counted: "1" }] }, user.id)).rejects.toThrow(
      "manejan stock",
    );
  });

  it("salida rápida resta con motivo; no se puede cambiar la unidad de un ítem con movimientos", async () => {
    const { user, cat } = await setup();
    const envase = await products.createProduct({ name: "Envase", categoryId: cat.id, type: "SUPPLY", tracksStock: true, sendsToKitchen: false, active: true });
    await ops.createConsumption({ productId: envase.id, quantity: "1", reason: "Envase para sobras" }, user.id);
    expect(await stock(envase.id)).toEqual(["-1"]);
    await expect(
      products.updateProduct(envase.id, { name: "Envase", categoryId: cat.id, type: "SUPPLY", baseUnit: "KG", tracksStock: true, sendsToKitchen: false, active: true }),
    ).rejects.toThrow("movimientos de stock");
  });
});
