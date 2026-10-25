import { db } from "@/core/db/client";
import { DomainError } from "@/core/errors";
import { runProductGuards } from "@/core/hooks/product-guards";

import {
  modifierInput,
  presentationInput,
  productInput,
  type ModifierInput,
  type PresentationInput,
  type ProductInput,
} from "../schemas";
import type { BaseUnit, ItemType } from "@/generated/prisma/enums";

import { ITEM_TYPE_LABEL, SELLABLE_TYPES } from "../domain/item-types";
import { normalizedOrder } from "./ordering";
import { RECIPE_COMPONENT_TYPES } from "./recipes";

const productInclude = {
  category: { select: { id: true, name: true, active: true } },
  modifiers: { orderBy: [{ sortOrder: "asc" as const }, { name: "asc" as const }] },
  presentations: { orderBy: [{ factor: "asc" as const }, { name: "asc" as const }] },
  _count: { select: { recipeLines: true } },
};

/** Todos los productos (activos e inactivos), agrupables por categoría en la pantalla de catálogo. */
export function listProducts() {
  return db.product.findMany({
    include: productInclude,
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export function getProduct(id: string) {
  return db.product.findUnique({ where: { id }, include: productInclude });
}

async function assertCategoryExists(categoryId: string) {
  const category = await db.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new DomainError("La categoría no existe", { categoryId: "Elige una categoría" });
}

export async function createProduct(input: ProductInput) {
  const data = productInput.parse(input);
  await assertCategoryExists(data.categoryId);
  const last = await db.product.aggregate({ where: { categoryId: data.categoryId }, _max: { sortOrder: true } });
  return db.product.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
}

/**
 * Cambiar el precio NO afecta ventas pasadas: cada ítem vendido guarda su propia copia del precio.
 */
export async function updateProduct(id: string, input: ProductInput) {
  const data = productInput.parse(input);
  await assertCategoryExists(data.categoryId);
  await assertRecipesStillValid(id, data.type, data.baseUnit);
  const before = await db.product.findUniqueOrThrow({ where: { id }, select: { type: true, baseUnit: true, tracksStock: true } });
  await runProductGuards({ productId: id, before, after: { type: data.type, baseUnit: data.baseUnit, tracksStock: data.tracksStock } });
  return db.product.update({ where: { id }, data });
}

/**
 * Cambiar tipo o unidad no puede dejar recetas inválidas:
 * - con receta propia, solo se puede seguir siendo un tipo que lleva receta (Preparado/Ingrediente, el mismo);
 * - si es componente de otras recetas, el nuevo tipo debe estar permitido ahí y la unidad no puede cambiar
 *   (las cantidades de esas recetas están en la unidad actual).
 */
async function assertRecipesStillValid(id: string, type: ItemType, baseUnit: BaseUnit) {
  const current = await db.product.findUnique({
    where: { id },
    select: {
      type: true,
      baseUnit: true,
      _count: { select: { recipeLines: true, usedInModifier: true } },
      usedInRecipes: { select: { product: { select: { type: true, name: true } } } },
    },
  });
  if (!current) throw new DomainError("El producto no existe");
  if (current.type !== type && current._count.recipeLines > 0) {
    throw new DomainError(`Tiene receta de ${ITEM_TYPE_LABEL[current.type]}: quítala antes de cambiar el tipo.`, {
      type: "Primero quita la receta",
    });
  }
  const owners = current.usedInRecipes.map((r) => r.product);
  const usedAnywhere = owners.length > 0 || current._count.usedInModifier > 0;
  if (!usedAnywhere) return;
  if (current.baseUnit !== baseUnit) {
    throw new DomainError("Se usa en recetas con cantidades en la unidad actual: quítalo de esas recetas antes de cambiar la unidad.", {
      baseUnit: "Se usa en recetas",
    });
  }
  const blocked = owners.find((o) => !(RECIPE_COMPONENT_TYPES[o.type as "PREPARED" | "INGREDIENT"] as readonly ItemType[]).includes(type));
  if (blocked || (type === "PREPARED" && current._count.usedInModifier > 0)) {
    const where = blocked ? `la receta de "${blocked.name}"` : "un modificador";
    throw new DomainError(`No puede ser ${ITEM_TYPE_LABEL[type]}: se usa en ${where}.`, { type: "Se usa en recetas" });
  }
}

/** Activar/desactivar (ej. "se acabó"): desaparece de la pantalla de venta, pero no se borra. */
export function setProductActive(id: string, active: boolean) {
  return db.product.update({ where: { id }, data: { active } });
}

export async function moveProduct(id: string, direction: "up" | "down") {
  const product = await db.product.findUnique({ where: { id } });
  if (!product) throw new DomainError("El producto no existe");
  const siblings = normalizedOrder(
    await db.product.findMany({ where: { categoryId: product.categoryId }, select: { id: true, sortOrder: true } }),
  );
  const index = siblings.findIndex((p) => p.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= siblings.length) return;
  [siblings[index], siblings[target]] = [siblings[target], siblings[index]];
  await db.$transaction(siblings.map((p, i) => db.product.update({ where: { id: p.id }, data: { sortOrder: i } })));
}

// --- Modificadores ---

export async function addModifier(productId: string, input: ModifierInput) {
  const data = modifierInput.parse(input);
  const last = await db.productModifier.aggregate({ where: { productId }, _max: { sortOrder: true } });
  return db.productModifier.create({ data: { productId, ...data, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
}

/**
 * Un modificador se puede borrar sin riesgo: las órdenes guardan una copia
 * (nombre y precio) de los modificadores que se usaron.
 */
export function removeModifier(id: string) {
  return db.productModifier.delete({ where: { id } });
}

/**
 * Agrega el mismo modificador a TODOS los productos de una categoría (ej. "Extra cheddar +4"
 * a todas las hamburguesas). Los productos que ya lo tienen no se tocan.
 */
export async function addModifierToCategory(categoryId: string, input: ModifierInput) {
  const data = modifierInput.parse(input);
  const products = await db.product.findMany({
    // Solo lo que se vende: un Insumo o Ingrediente no lleva modificadores.
    where: { categoryId, type: { in: SELLABLE_TYPES } },
    select: { id: true, modifiers: { select: { name: true, sortOrder: true } } },
  });
  if (products.length === 0) throw new DomainError("La categoría no tiene productos.");
  let added = 0;
  for (const p of products) {
    if (p.modifiers.some((m) => m.name.toLowerCase() === data.name.toLowerCase())) continue;
    const sortOrder = Math.max(-1, ...p.modifiers.map((m) => m.sortOrder)) + 1;
    await db.productModifier.create({ data: { productId: p.id, ...data, sortOrder } });
    added++;
  }
  return { added, skipped: products.length - added };
}

// --- Presentaciones de compra ---

/** Ej. "Bolsa x12" = 12 unidades base. Solo para ítems que se compran (no Preparado). */
export async function addPresentation(productId: string, input: PresentationInput) {
  const data = presentationInput.parse(input);
  const product = await db.product.findUnique({ where: { id: productId }, select: { type: true } });
  if (!product) throw new DomainError("El producto no existe");
  if (product.type === "PREPARED") throw new DomainError("Un Preparado no se compra: no lleva presentaciones.");
  return db.productPresentation.create({ data: { productId, ...data } });
}

/** Se puede borrar: las compras guardarán su propia copia (nombre y factor) de la presentación usada. */
export function removePresentation(id: string) {
  return db.productPresentation.delete({ where: { id } });
}
