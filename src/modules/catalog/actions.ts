"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { type ActionResult, toActionResult } from "@/core/actions/result";
import { requirePermission } from "@/core/auth/server";
import { DomainError } from "@/core/errors";

import type { BulkRow } from "./domain/bulk";
import type { ProductInput } from "./schemas";
import * as bulk from "./services/bulk";
import type { BulkError } from "./services/bulk";
import * as categories from "./services/categories";
import { readImportFile } from "./services/import-file";
import * as products from "./services/products";
import * as recipes from "./services/recipes";

const DUPLICATE_CATEGORY = "Ya existe una categoría con ese nombre.";
const DUPLICATE_PRODUCT = "Ya existe un producto con ese nombre en esa categoría.";
const DUPLICATE_MODIFIER = "Ese modificador ya existe en el producto.";
const DUPLICATE_PRESENTATION = "Esa presentación ya existe en el ítem.";

function refreshCatalog() {
  revalidatePath("/catalogo", "layout");
  revalidatePath("/pos");
}

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");

// --- Categorías ---

export async function createCategoryAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePermission("catalog.manage");
  return toActionResult(
    async () => {
      await categories.createCategory({ name: text(fd, "name") });
      refreshCatalog();
      return "Categoría creada";
    },
    { duplicate: DUPLICATE_CATEGORY },
  );
}

export async function renameCategoryAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePermission("catalog.manage");
  return toActionResult(
    async () => {
      await categories.renameCategory(text(fd, "id"), { name: text(fd, "name") });
      refreshCatalog();
      return "Guardado";
    },
    { duplicate: DUPLICATE_CATEGORY },
  );
}

export async function setCategoryActiveAction(id: string, active: boolean) {
  await requirePermission("catalog.manage");
  await categories.setCategoryActive(id, active);
  refreshCatalog();
}

export async function moveCategoryAction(id: string, direction: "up" | "down") {
  await requirePermission("catalog.manage");
  await categories.moveCategory(id, direction);
  refreshCatalog();
}

// --- Productos ---

function productFromForm(fd: FormData) {
  return {
    name: text(fd, "name"),
    categoryId: text(fd, "categoryId"),
    type: text(fd, "type") as ProductInput["type"],
    priceCents: text(fd, "price"),
    sendsToKitchen: fd.get("sendsToKitchen") === "on",
    active: fd.get("active") === "on",
    baseUnit: text(fd, "baseUnit") as ProductInput["baseUnit"],
    tracksStock: fd.get("tracksStock") === "on",
    minStock: text(fd, "minStock"),
    lastCostCents: text(fd, "lastCost"),
  };
}

export async function saveProductAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePermission("catalog.manage");
  const id = text(fd, "id");
  let createdId: string | null = null;
  const result = await toActionResult(
    async () => {
      if (id) {
        await products.updateProduct(id, productFromForm(fd));
      } else {
        createdId = (await products.createProduct(productFromForm(fd))).id;
      }
      refreshCatalog();
      return "Producto guardado";
    },
    { duplicate: DUPLICATE_PRODUCT },
  );
  // Al crear, se pasa a la edición para poder cargar los modificadores.
  if (createdId) redirect(`/catalogo/productos/${createdId}?nuevo=1`);
  return result;
}

export async function setProductActiveAction(id: string, active: boolean) {
  await requirePermission("catalog.manage");
  await products.setProductActive(id, active);
  refreshCatalog();
}

export async function moveProductAction(id: string, direction: "up" | "down") {
  await requirePermission("catalog.manage");
  await products.moveProduct(id, direction);
  refreshCatalog();
}

// --- Modificadores ---

export async function addModifierAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePermission("catalog.manage");
  return toActionResult(
    async () => {
      await products.addModifier(text(fd, "productId"), {
        name: text(fd, "name"),
        priceDeltaCents: text(fd, "priceDelta"),
      });
      refreshCatalog();
      return "Modificador agregado";
    },
    { duplicate: DUPLICATE_MODIFIER },
  );
}

export async function addModifierToCategoryAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePermission("catalog.manage");
  return toActionResult(async () => {
    const r = await products.addModifierToCategory(text(fd, "categoryId"), {
      name: text(fd, "name"),
      priceDeltaCents: text(fd, "priceDelta"),
    });
    refreshCatalog();
    return r.skipped > 0
      ? `Agregado a ${r.added} productos (${r.skipped} ya lo tenían)`
      : `Agregado a ${r.added} productos`;
  });
}

export async function removeModifierAction(id: string) {
  await requirePermission("catalog.manage");
  await products.removeModifier(id);
  refreshCatalog();
}

// --- Presentaciones de compra ---

export async function addPresentationAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePermission("catalog.manage");
  return toActionResult(
    async () => {
      await products.addPresentation(text(fd, "productId"), { name: text(fd, "name"), factor: text(fd, "factor") });
      refreshCatalog();
      return "Presentación agregada";
    },
    { duplicate: DUPLICATE_PRESENTATION },
  );
}

export async function removePresentationAction(id: string) {
  await requirePermission("catalog.manage");
  await products.removePresentation(id);
  refreshCatalog();
}

// --- Recetas ---

const DUPLICATE_LINE = "Ese componente ya está en la receta.";

export async function setRecipeLineAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePermission("catalog.manage");
  return toActionResult(
    async () => {
      await recipes.setRecipeLine(text(fd, "ownerId"), {
        componentId: text(fd, "componentId"),
        quantity: text(fd, "quantity"),
        condition: (text(fd, "condition") || "ALWAYS") as "ALWAYS",
      });
      refreshCatalog();
      return "Receta guardada";
    },
    { duplicate: DUPLICATE_LINE },
  );
}

export async function removeRecipeLineAction(id: string) {
  await requirePermission("catalog.manage");
  await recipes.removeRecipeLine(id);
  refreshCatalog();
}

export async function setRecipeYieldAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePermission("catalog.manage");
  return toActionResult(async () => {
    await recipes.setRecipeYield(text(fd, "ownerId"), { recipeYield: text(fd, "recipeYield") });
    refreshCatalog();
    return "Rendimiento guardado";
  });
}

export async function setModifierRecipeLineAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePermission("catalog.manage");
  return toActionResult(
    async () => {
      await recipes.setModifierRecipeLine(text(fd, "ownerId"), {
        componentId: text(fd, "componentId"),
        quantity: text(fd, "quantity"),
      });
      refreshCatalog();
      return "Guardado";
    },
    { duplicate: DUPLICATE_LINE },
  );
}

export async function removeModifierRecipeLineAction(id: string) {
  await requirePermission("catalog.manage");
  await recipes.removeModifierRecipeLine(id);
  refreshCatalog();
}

export async function copyModifierRecipeAction(modifierId: string): Promise<ActionResult> {
  await requirePermission("catalog.manage");
  return toActionResult(async () => {
    const { updated } = await recipes.copyModifierRecipeToSameName(modifierId);
    refreshCatalog();
    return updated === 0 ? "No hay otros productos con ese modificador" : `Copiado a ${updated} productos`;
  });
}

// --- Carga rápida ---

export async function readImportFileAction(fd: FormData): Promise<{ ok: true; rows: BulkRow[] } | { ok: false; error: string }> {
  await requirePermission("catalog.manage");
  const file = fd.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Elige un archivo." };
  try {
    return { ok: true, rows: await readImportFile(file) };
  } catch (error) {
    return { ok: false, error: error instanceof DomainError ? error.message : "No se pudo leer el archivo." };
  }
}

export async function bulkCreateItemsAction(rows: BulkRow[]): Promise<{ ok: boolean; message?: string; errors: BulkError[] }> {
  await requirePermission("catalog.manage");
  try {
    const r = await bulk.bulkCreateItems(rows);
    if (r.errors.length > 0) return { ok: false, message: "Corrige las filas marcadas: no se guardó nada.", errors: r.errors };
    refreshCatalog();
    revalidatePath("/inventario", "layout");
    return { ok: true, message: `Se crearon ${r.created} ítems.`, errors: [] };
  } catch (error) {
    return { ok: false, message: error instanceof DomainError ? error.message : "Ocurrió un error inesperado.", errors: [] };
  }
}
