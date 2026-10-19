import { db } from "@/core/db/client";
import { DomainError } from "@/core/errors";
import type { Decimal } from "@/core/quantity";
import type { ItemType, ServiceType } from "@/generated/prisma/enums";

import { SELLABLE_TYPES } from "../domain/item-types";
import { ingredientUnitCost, margin, recipeCost, type CostedLine } from "../domain/recipes";
import {
  modifierRecipeLineInput,
  recipeLineInput,
  recipeYieldInput,
  type ModifierRecipeLineInput,
  type RecipeLineInput,
} from "../schemas";

/** Qué tipos de componente admite cada receta. Un Preparado nunca es componente. */
export const RECIPE_COMPONENT_TYPES = {
  PREPARED: ["INGREDIENT", "SUPPLY", "NORMAL"],
  INGREDIENT: ["SUPPLY"],
  MODIFIER: ["INGREDIENT", "SUPPLY", "NORMAL"],
} as const satisfies Record<string, ItemType[]>;

export type RecipeOwnerKind = keyof typeof RECIPE_COMPONENT_TYPES;

const componentSelect = {
  id: true,
  name: true,
  type: true,
  baseUnit: true,
  tracksStock: true,
  category: { select: { name: true } },
} as const;

/** Ítems que se pueden elegir como componente (activos y del tipo permitido). */
export function listRecipeComponents(kind: RecipeOwnerKind) {
  return db.product.findMany({
    where: { active: true, type: { in: [...RECIPE_COMPONENT_TYPES[kind]] } },
    select: componentSelect,
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });
}

async function assertComponent(kind: RecipeOwnerKind, componentId: string, ownerId?: string) {
  if (componentId === ownerId) throw new DomainError("Un ítem no puede ser componente de sí mismo.");
  const component = await db.product.findUnique({ where: { id: componentId }, select: { type: true } });
  if (!component) throw new DomainError("El componente no existe", { componentId: "Elige un componente" });
  if (!(RECIPE_COMPONENT_TYPES[kind] as readonly ItemType[]).includes(component.type)) {
    const msg = kind === "INGREDIENT" ? "La receta de un Ingrediente solo lleva Insumos." : "Un Preparado no puede ser componente.";
    throw new DomainError(msg, { componentId: msg });
  }
}

// --- Receta de Preparado o Ingrediente ---

/** Agrega un componente; si ya estaba (con la misma condición), actualiza la cantidad. */
export async function setRecipeLine(productId: string, input: RecipeLineInput) {
  const data = recipeLineInput.parse(input);
  const owner = await db.product.findUnique({ where: { id: productId }, select: { type: true } });
  if (!owner) throw new DomainError("El ítem no existe");
  if (owner.type !== "PREPARED" && owner.type !== "INGREDIENT") {
    throw new DomainError("Solo los Preparados y los Ingredientes llevan receta.");
  }
  await assertComponent(owner.type, data.componentId, productId);
  // La receta de un Ingrediente es solo referencia de costo: no depende de para llevar / comer aquí.
  const condition = owner.type === "INGREDIENT" ? "ALWAYS" : data.condition;
  return db.recipeLine.upsert({
    where: { productId_componentId_condition: { productId, componentId: data.componentId, condition } },
    create: { productId, componentId: data.componentId, quantity: data.quantity, condition },
    update: { quantity: data.quantity },
  });
}

export function removeRecipeLine(id: string) {
  return db.recipeLine.delete({ where: { id } });
}

/** Rendimiento de la receta de un Ingrediente (ej. 1 kg de carne molida rinde 8 medallones). */
export async function setRecipeYield(productId: string, input: { recipeYield: string }) {
  const { recipeYield } = recipeYieldInput.parse(input);
  const owner = await db.product.findUnique({ where: { id: productId }, select: { type: true } });
  if (owner?.type !== "INGREDIENT") throw new DomainError("Solo un Ingrediente tiene rendimiento.");
  return db.product.update({ where: { id: productId }, data: { recipeYield } });
}

// --- Receta de modificadores ---

export async function setModifierRecipeLine(modifierId: string, input: ModifierRecipeLineInput) {
  const data = modifierRecipeLineInput.parse(input);
  const modifier = await db.productModifier.findUnique({ where: { id: modifierId }, select: { productId: true } });
  if (!modifier) throw new DomainError("El modificador no existe");
  await assertComponent("MODIFIER", data.componentId, modifier.productId);
  return db.modifierRecipeLine.upsert({
    where: { modifierId_componentId: { modifierId, componentId: data.componentId } },
    create: { modifierId, componentId: data.componentId, quantity: data.quantity },
    update: { quantity: data.quantity },
  });
}

export function removeModifierRecipeLine(id: string) {
  return db.modifierRecipeLine.delete({ where: { id } });
}

/**
 * Copia lo que descuenta este modificador a todos los modificadores con el mismo nombre
 * (ej. "Extra queso" en todas las hamburguesas y lomitos). Reemplaza lo que tenían.
 */
export async function copyModifierRecipeToSameName(modifierId: string) {
  const source = await db.productModifier.findUnique({ where: { id: modifierId }, include: { recipeLines: true } });
  if (!source) throw new DomainError("El modificador no existe");
  const targets = await db.productModifier.findMany({
    where: {
      id: { not: modifierId },
      name: { equals: source.name, mode: "insensitive" },
      product: { type: { in: SELLABLE_TYPES } },
    },
    select: { id: true },
  });
  await db.$transaction([
    db.modifierRecipeLine.deleteMany({ where: { modifierId: { in: targets.map((t) => t.id) } } }),
    db.modifierRecipeLine.createMany({
      data: targets.flatMap((t) =>
        source.recipeLines.map((l) => ({ modifierId: t.id, componentId: l.componentId, quantity: l.quantity })),
      ),
    }),
  ]);
  return { updated: targets.length };
}

// --- Costos ---

/**
 * Costo por unidad base de cada componente.
 * Ingrediente: su último costo (el del último ingreso a inventario) o, si no tiene, el estimado por su receta.
 */
export async function unitCosts(componentIds: string[]): Promise<Map<string, Decimal | null>> {
  const components = await db.product.findMany({
    where: { id: { in: componentIds } },
    select: {
      id: true,
      type: true,
      lastCostCents: true,
      recipeYield: true,
      recipeLines: { select: { quantity: true, component: { select: { lastCostCents: true } } } },
    },
  });
  return new Map(
    components.map((c) => {
      if (c.type !== "INGREDIENT" || c.lastCostCents) return [c.id, c.lastCostCents];
      const lines = c.recipeLines.map((l) => ({ quantity: l.quantity, unitCostCents: l.component.lastCostCents }));
      return [c.id, ingredientUnitCost(lines, c.recipeYield).unitCostCents];
    }),
  );
}

/** Todo lo que muestra la pantalla de receta de un ítem: líneas con costo, totales y márgenes. */
export async function getRecipeView(productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      type: true,
      priceCents: true,
      recipeYield: true,
      lastCostCents: true,
      recipeLines: { select: { id: true, quantity: true, condition: true, component: { select: componentSelect } } },
      modifiers: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          priceDeltaCents: true,
          recipeLines: { select: { id: true, quantity: true, component: { select: componentSelect } } },
        },
      },
    },
  });
  if (!product) return null;

  const ids = [
    ...product.recipeLines.map((l) => l.component.id),
    ...product.modifiers.flatMap((m) => m.recipeLines.map((l) => l.component.id)),
  ];
  const costs = await unitCosts([...new Set(ids)]);
  const withCost = <L extends { quantity: Decimal; component: { id: string } }>(line: L) => {
    const unitCostCents = costs.get(line.component.id) ?? null;
    return { ...line, unitCostCents, lineCostCents: unitCostCents ? line.quantity.mul(unitCostCents) : null };
  };

  const lines = product.recipeLines
    .map(withCost)
    .sort((a, b) => a.condition.localeCompare(b.condition) || a.component.name.localeCompare(b.component.name));
  const costed: CostedLine[] = lines.map((l) => ({ quantity: l.quantity, unitCostCents: l.unitCostCents, condition: l.condition }));

  const costFor = (serviceType: ServiceType) => {
    const cost = recipeCost(costed, serviceType);
    return { ...cost, ...margin(product.priceCents, cost.costCents) };
  };

  return {
    type: product.type,
    priceCents: product.priceCents,
    lines,
    dineIn: costFor("DINE_IN"),
    takeaway: costFor("TAKEAWAY"),
    ingredient:
      product.type === "INGREDIENT"
        ? { recipeYield: product.recipeYield, lastCostCents: product.lastCostCents, ...ingredientUnitCost(costed, product.recipeYield) }
        : null,
    modifiers: product.modifiers.map((m) => {
      const mLines = m.recipeLines.map(withCost);
      return { ...m, recipeLines: mLines, cost: recipeCost(mLines, "DINE_IN") };
    }),
  };
}

export type RecipeView = NonNullable<Awaited<ReturnType<typeof getRecipeView>>>;
