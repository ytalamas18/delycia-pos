import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { disconnectDb } from "@/core/db/client";
import { Decimal } from "@/core/quantity";
import { ingredientUnitCost, margin, recipeCost, stockConsumption } from "@/modules/catalog/domain/recipes";
import * as categories from "@/modules/catalog/services/categories";
import * as products from "@/modules/catalog/services/products";
import * as recipes from "@/modules/catalog/services/recipes";

import { resetDatabase } from "../support/db";

const d = (v: string | number) => new Decimal(v);

describe("recetas (cálculo)", () => {
  it("costo del plato según para llevar o comer aquí, y margen", () => {
    const lines = [
      { quantity: d(1), unitCostCents: d(550), condition: "ALWAYS" as const }, // medallón 5,50
      { quantity: d(1), unitCostCents: d(150), condition: "ALWAYS" as const }, // pan 1,50
      { quantity: d(1), unitCostCents: d(120), condition: "TAKEAWAY" as const }, // caja 1,20
      { quantity: d(1), unitCostCents: null, condition: "DINE_IN" as const }, // servilleta sin costo
    ];
    expect(recipeCost(lines, "DINE_IN")).toEqual({ costCents: d(700), missing: 1 });
    expect(recipeCost(lines, "TAKEAWAY")).toEqual({ costCents: d(820), missing: 0 });
    const m = margin(4000, d(820));
    expect(m.marginCents.toString()).toBe("3180");
    expect(m.percent).toBe(79.5);
  });

  it("costo unitario de un Ingrediente = costo de sus insumos ÷ rendimiento", () => {
    // 2 kg de carne molida a Bs 52/kg + 0,05 kg de condimento a Bs 80/kg, rinde 16 medallones
    const lines = [
      { quantity: d(2), unitCostCents: d(5200) },
      { quantity: d("0.05"), unitCostCents: d(8000) },
    ];
    const r = ingredientUnitCost(lines, d(16));
    expect(r.costCents.toString()).toBe("10800");
    expect(r.unitCostCents?.toString()).toBe("675"); // Bs 6,75 por medallón
    expect(ingredientUnitCost(lines, null).unitCostCents).toBeNull();
  });

  it("descuento por receta: solo componentes con stock, según el servicio y con modificadores", () => {
    const item = {
      productId: "burger",
      type: "PREPARED" as const,
      tracksStock: false,
      quantity: 2,
      serviceType: "TAKEAWAY" as const,
      recipe: [
        { componentId: "medallon", quantity: d(1), tracksStock: true },
        { componentId: "pan", quantity: d(1), tracksStock: true },
        { componentId: "sal", quantity: d(2), tracksStock: false }, // sin stock: se ignora
        { componentId: "caja", quantity: d(1), tracksStock: true, condition: "TAKEAWAY" as const },
        { componentId: "plato", quantity: d(1), tracksStock: true, condition: "DINE_IN" as const },
      ],
      modifierLines: [{ componentId: "queso", quantity: d("0.03"), tracksStock: true }],
    };
    const out = Object.fromEntries(stockConsumption(item).map((c) => [c.componentId, c.quantity.toString()]));
    expect(out).toEqual({ medallon: "2", pan: "2", caja: "2", queso: "0.06" });
    expect(stockConsumption({ ...item, serviceType: "DINE_IN" }).map((c) => c.componentId).sort()).toEqual([
      "medallon",
      "pan",
      "plato",
      "queso",
    ]);
    // Sin receta: se vende igual y no descuenta nada.
    expect(stockConsumption({ ...item, recipe: [], modifierLines: [] })).toEqual([]);
  });

  it("un Normal con stock se descuenta a sí mismo; sin stock, nada", () => {
    const base = { productId: "coca", type: "NORMAL" as const, quantity: 3, serviceType: "DINE_IN" as const, recipe: [], modifierLines: [] };
    expect(stockConsumption({ ...base, tracksStock: true }).map((c) => [c.componentId, c.quantity.toString()])).toEqual([["coca", "3"]]);
    expect(stockConsumption({ ...base, tracksStock: false })).toEqual([]);
  });
});

describe("recetas (base de datos)", () => {
  beforeEach(resetDatabase);
  afterAll(disconnectDb);

  async function setup() {
    const cat = await categories.createCategory({ name: "Varios" });
    const base = { categoryId: cat.id, sendsToKitchen: true, active: true };
    const burger = await products.createProduct({ ...base, name: "Hamburguesa", type: "PREPARED", priceCents: "40" });
    const carne = await products.createProduct({ ...base, name: "Carne molida", type: "SUPPLY", baseUnit: "KG", tracksStock: true, lastCostCents: "52" });
    const medallon = await products.createProduct({ ...base, name: "Medallón", type: "INGREDIENT" });
    const pan = await products.createProduct({ ...base, name: "Pan", type: "SUPPLY", tracksStock: true, lastCostCents: "1,5" });
    const coca = await products.createProduct({ ...base, name: "Coca", type: "NORMAL", priceCents: "6", tracksStock: true, lastCostCents: "4" });
    return { cat, burger, carne, medallon, pan, coca };
  }

  it("arma la receta de un Ingrediente y la de un Preparado con costo estimado", async () => {
    const { burger, carne, medallon, pan } = await setup();
    await recipes.setRecipeLine(medallon.id, { componentId: carne.id, quantity: "2" });
    await recipes.setRecipeYield(medallon.id, { recipeYield: "16" });
    await recipes.setRecipeLine(burger.id, { componentId: medallon.id, quantity: "1" });
    await recipes.setRecipeLine(burger.id, { componentId: pan.id, quantity: "1" });

    const view = await recipes.getRecipeView(burger.id);
    // medallón: 2 kg × 5200 / 16 = 650 ; + pan 150 = 800 → Bs 8,00
    expect(view?.dineIn.costCents.toString()).toBe("800");
    expect(view?.dineIn.missing).toBe(0);
    expect(view?.dineIn.percent).toBe(80);

    const ing = await recipes.getRecipeView(medallon.id);
    expect(ing?.ingredient?.unitCostCents?.toString()).toBe("650");

    // Volver a agregar el mismo componente actualiza la cantidad (no duplica).
    await recipes.setRecipeLine(burger.id, { componentId: pan.id, quantity: "2" });
    expect((await recipes.getRecipeView(burger.id))?.lines).toHaveLength(2);
  });

  it("valida componentes: Ingrediente solo con Insumos; un Preparado nunca es componente", async () => {
    const { burger, medallon, coca, pan, cat } = await setup();
    await expect(recipes.setRecipeLine(medallon.id, { componentId: coca.id, quantity: "1" })).rejects.toThrow("solo lleva Insumos");
    const otro = await products.createProduct({ name: "Combo", categoryId: cat.id, type: "PREPARED", priceCents: "50", sendsToKitchen: true, active: true });
    await expect(recipes.setRecipeLine(otro.id, { componentId: burger.id, quantity: "1" })).rejects.toThrow("no puede ser componente");
    await expect(recipes.setRecipeLine(coca.id, { componentId: pan.id, quantity: "1" })).rejects.toThrow("llevan receta");
    await expect(recipes.setRecipeLine(burger.id, { componentId: pan.id, quantity: "0" })).rejects.toThrow("Cantidad inválida");
    // La receta del Ingrediente ignora "para llevar": siempre aplica.
    const line = await recipes.setRecipeLine(medallon.id, { componentId: pan.id, quantity: "1", condition: "TAKEAWAY" });
    expect(line.condition).toBe("ALWAYS");
  });

  it("no deja cambiar tipo o unidad si rompe recetas", async () => {
    const { burger, carne, medallon, pan, cat } = await setup();
    await recipes.setRecipeLine(medallon.id, { componentId: carne.id, quantity: "2" });
    await recipes.setRecipeLine(burger.id, { componentId: pan.id, quantity: "1" });
    const edit = (id: string, name: string, extra: object) =>
      products.updateProduct(id, { name, categoryId: cat.id, sendsToKitchen: false, active: true, ...extra });

    await expect(edit(burger.id, "Hamburguesa", { type: "NORMAL", priceCents: "40" })).rejects.toThrow("quítala antes");
    await expect(edit(carne.id, "Carne molida", { type: "SUPPLY", baseUnit: "G", tracksStock: true })).rejects.toThrow("cambiar la unidad");
    await expect(edit(carne.id, "Carne molida", { type: "INGREDIENT", baseUnit: "KG" })).rejects.toThrow('receta de "Medallón"');
    await expect(edit(pan.id, "Pan", { type: "PREPARED", priceCents: "2" })).rejects.toThrow("No puede ser Preparado");
    // Cambios que no afectan recetas sí se permiten.
    await edit(pan.id, "Pan brioche", { type: "SUPPLY", tracksStock: true, minStock: "10" });
  });

  it("modificadores: receta propia y copia a los que tienen el mismo nombre", async () => {
    const { burger, cat, coca } = await setup();
    const queso = await products.createProduct({ name: "Queso", categoryId: cat.id, type: "SUPPLY", baseUnit: "G", tracksStock: true, lastCostCents: "0,06", sendsToKitchen: false, active: true });
    const lomito = await products.createProduct({ name: "Lomito", categoryId: cat.id, type: "PREPARED", priceCents: "35", sendsToKitchen: true, active: true });
    const extra = await products.addModifier(burger.id, { name: "Extra queso", priceDeltaCents: "3" });
    await products.addModifier(lomito.id, { name: "extra queso", priceDeltaCents: "3" });
    await recipes.setModifierRecipeLine(extra.id, { componentId: queso.id, quantity: "30" });
    await expect(recipes.setModifierRecipeLine(extra.id, { componentId: burger.id, quantity: "1" })).rejects.toThrow();

    expect(await recipes.copyModifierRecipeToSameName(extra.id)).toEqual({ updated: 1 });
    const view = await recipes.getRecipeView(lomito.id);
    expect(view?.modifiers[0].recipeLines.map((l) => [l.component.name, l.quantity.toString()])).toEqual([["Queso", "30"]]);
    expect(view?.modifiers[0].cost.costCents.toString()).toBe("180"); // 30 g × 6 centavos
    void coca;
  });
});
