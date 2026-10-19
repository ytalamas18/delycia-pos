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

  it("tipos: solo Normal y Preparado se venden; Insumo e Ingrediente no necesitan precio", async () => {
    const { platos, plato } = await setup();
    const carne = await products.createProduct({
      name: "Carne molida",
      categoryId: platos.id,
      type: "SUPPLY",
      priceCents: "",
      sendsToKitchen: true,
      active: true,
      baseUnit: "KG",
      tracksStock: true,
      minStock: "2,5",
      lastCostCents: "52",
    });
    expect(carne).toMatchObject({ priceCents: 0, sendsToKitchen: false, tracksStock: true, baseUnit: "KG" });
    expect(carne.minStock?.toString()).toBe("2.5");
    expect(carne.lastCostCents?.toString()).toBe("5200");

    const medallon = await products.createProduct({
      name: "Carne de hamburguesa",
      categoryId: platos.id,
      type: "INGREDIENT",
      sendsToKitchen: false,
      active: true,
      tracksStock: false, // Ingrediente: siempre maneja stock
    });
    expect(medallon.tracksStock).toBe(true);

    await products.updateProduct(plato.id, {
      name: "Majadito",
      categoryId: platos.id,
      type: "PREPARED",
      priceCents: "38",
      sendsToKitchen: true,
      active: true,
      baseUnit: "KG",
      tracksStock: true, // Preparado: nunca maneja stock
      minStock: "3",
    });
    const updated = await db.product.findUniqueOrThrow({ where: { id: plato.id } });
    expect(updated).toMatchObject({ type: "PREPARED", tracksStock: false, baseUnit: "UNIT", minStock: null });

    const sellable = await getSellableCatalog();
    expect(sellable.flatMap((c) => c.products.map((p) => p.name)).sort()).toEqual(["Gaseosa", "Majadito"]);
    expect(await getSellableProduct(carne.id)).toBeNull();

    await expect(
      products.createProduct({ name: "Sin precio", categoryId: platos.id, type: "PREPARED", priceCents: "", sendsToKitchen: true, active: true }),
    ).rejects.toThrow("Ingresa el precio");
  });

  it("el modificador a toda la categoría no se agrega a insumos", async () => {
    const { platos } = await setup();
    await products.createProduct({ name: "Pan", categoryId: platos.id, type: "SUPPLY", sendsToKitchen: false, active: true });
    const r = await products.addModifierToCategory(platos.id, { name: "Extra queso", priceDeltaCents: "3" });
    expect(r.added).toBe(1);
  });

  it("presentaciones de compra: no en Preparado, sin repetir nombre", async () => {
    const { platos, gaseosa } = await setup();
    const bolsa = await products.addPresentation(gaseosa.id, { name: "Paquete x6", factor: "6" });
    expect(bolsa.factor.toString()).toBe("6");
    await expect(products.addPresentation(gaseosa.id, { name: "Paquete x6", factor: "6" })).rejects.toMatchObject({ code: "P2002" });
    await expect(products.addPresentation(gaseosa.id, { name: "Cero", factor: "0" })).rejects.toThrow("Cantidad inválida");

    const hamburguesa = await products.createProduct({
      name: "Hamburguesa",
      categoryId: platos.id,
      type: "PREPARED",
      priceCents: "40",
      sendsToKitchen: true,
      active: true,
    });
    await expect(products.addPresentation(hamburguesa.id, { name: "Caja", factor: "10" })).rejects.toThrow("no se compra");
  });
});
