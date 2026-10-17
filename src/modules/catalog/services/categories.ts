import { db } from "@/core/db/client";
import { DomainError } from "@/core/errors";

import { categoryInput, type CategoryInput } from "../schemas";
import { normalizedOrder } from "./ordering";

export function listCategories() {
  return db.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
}

export async function createCategory(input: CategoryInput) {
  const data = categoryInput.parse(input);
  const last = await db.category.aggregate({ _max: { sortOrder: true } });
  return db.category.create({ data: { ...data, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
}

export async function renameCategory(id: string, input: CategoryInput) {
  const data = categoryInput.parse(input);
  return db.category.update({ where: { id }, data });
}

/** Desactivar oculta la categoría (y sus productos) de la pantalla de venta. No se borra nada. */
export function setCategoryActive(id: string, active: boolean) {
  return db.category.update({ where: { id }, data: { active } });
}

export async function moveCategory(id: string, direction: "up" | "down") {
  const all = normalizedOrder(await db.category.findMany({ select: { id: true, sortOrder: true } }));
  const index = all.findIndex((c) => c.id === id);
  if (index === -1) throw new DomainError("La categoría no existe");
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= all.length) return;
  [all[index], all[target]] = [all[target], all[index]];
  await db.$transaction(all.map((c, i) => db.category.update({ where: { id: c.id }, data: { sortOrder: i } })));
}
