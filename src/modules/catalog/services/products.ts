import { db } from "@/core/db/client";
import { DomainError } from "@/core/errors";

import { modifierInput, productInput, type ModifierInput, type ProductInput } from "../schemas";
import { normalizedOrder } from "./ordering";

const productInclude = {
  category: { select: { id: true, name: true, active: true } },
  modifiers: { orderBy: [{ sortOrder: "asc" as const }, { name: "asc" as const }] },
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
  return db.product.update({ where: { id }, data });
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
