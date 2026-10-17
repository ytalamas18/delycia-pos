import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, disconnectDb } from "@/core/db/client";
import { getSellableCatalog, getSellableProduct } from "@/modules/catalog";

import * as categories from "@/modules/catalog/services/categories";
import * as products from "@/modules/catalog/services/products";

import { resetDatabase } from "../support/db";

async function setup() {
  const platos = await categories.createCategory({ name: "Platos" });
  const bebidas = await categories.createCategory({ name: "Bebidas" });
  const plato = await products.createProduct({
    name: "Majadito",
    categoryId: platos.id,
    priceCents: "38",
    sendsToKitchen: true,
    active: true,
  });
  const gaseosa = await products.createProduct({
    name: "Gaseosa",
    categoryId: bebidas.id,
    priceCents: "10,50",
    sendsToKitchen: false,
    active: true,
  });
  return { platos, bebidas, plato, gaseosa };
}

describe("catálogo", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectDb);

  it("guarda el precio escrito a mano en centavos", async () => {
    const { plato, gaseosa } = await setup();
    expect(plato.priceCents).toBe(3800);
    expect(gaseosa.priceCents).toBe(1050);
    expect(gaseosa.sendsToKitchen).toBe(false);
  });

  it("valida los datos con mensajes en español", async () => {
    const { platos } = await setup();
    await expect(
      products.createProduct({ name: " ", categoryId: platos.id, priceCents: "abc", sendsToKitchen: true, active: true }),
    ).rejects.toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ message: "Ingresa un nombre" })]) });
    await expect(
      products.createProduct({ name: "Gratis", categoryId: platos.id, priceCents: "0", sendsToKitchen: true, active: true }),
    ).rejects.toThrow("El precio debe ser mayor a 0");
  });

  it("no permite nombres repetidos en la misma categoría", async () => {
    const { platos } = await setup();
    await expect(
      products.createProduct({ name: "Majadito", categoryId: platos.id, priceCents: "40", sendsToKitchen: true, active: true }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("lo inactivo (producto o categoría) desaparece de la venta pero no se borra", async () => {
    const { plato, bebidas, gaseosa } = await setup();
    await products.setProductActive(plato.id, false);
    await categories.setCategoryActive(bebidas.id, false);

    expect(await getSellableCatalog()).toEqual([]);
    expect(await getSellableProduct(gaseosa.id)).toBeNull();
    expect(await db.product.count()).toBe(2);
  });

  it("ordena categorías con subir/bajar", async () => {
    const { bebidas } = await setup();
    await categories.moveCategory(bebidas.id, "up");
    const sellable = await getSellableCatalog();
    expect(sellable.map((c) => c.name)).toEqual(["Bebidas", "Platos"]);
    await categories.moveCategory(bebidas.id, "up"); // ya es la primera: no hace nada
    expect((await getSellableCatalog())[0].name).toBe("Bebidas");
  });

  it("modificadores: con y sin costo, y se pueden quitar", async () => {
    const { plato } = await setup();
    await products.addModifier(plato.id, { name: "Sin cebolla", priceDeltaCents: "" });
    const extra = await products.addModifier(plato.id, { name: "Extra huevo", priceDeltaCents: "5" });

    let sellable = await getSellableProduct(plato.id);
    expect(sellable?.modifiers).toEqual([
      expect.objectContaining({ name: "Sin cebolla", priceDeltaCents: 0 }),
      expect.objectContaining({ name: "Extra huevo", priceDeltaCents: 500 }),
    ]);

    await products.removeModifier(extra.id);
    sellable = await getSellableProduct(plato.id);
    expect(sellable?.modifiers.map((m) => m.name)).toEqual(["Sin cebolla"]);
  });

  it("agrega un modificador a toda la categoría sin duplicar", async () => {
    const { platos, plato } = await setup();
    await products.createProduct({ name: "Lomito", categoryId: platos.id, priceCents: "35", sendsToKitchen: true, active: true });
    await products.addModifier(plato.id, { name: "Extra cheddar", priceDeltaCents: "4" });

    const r = await products.addModifierToCategory(platos.id, { name: "extra cheddar", priceDeltaCents: "4" });
    expect(r).toEqual({ added: 1, skipped: 1 });
    const all = await db.productModifier.findMany({ where: { product: { categoryId: platos.id } } });
    expect(all.map((m) => m.priceDeltaCents)).toEqual([400, 400]);
  });
});
