import { runInTransaction } from "@/core/db/transaction";
import { DomainError } from "@/core/errors";
import { formatMoneyInput } from "@/core/money";
import { parseQuantity, type Decimal } from "@/core/quantity";

import { parseBaseUnit, parseItemType, parseYesNo, type BulkRow } from "../domain/bulk";
import { textKey } from "../domain/text";
import { productInput } from "../schemas";

export type BulkError = { row: number; message: string };

/**
 * Carga rápida: crea muchos ítems de una vez (y las categorías que falten). Todo o nada: si una fila tiene
 * errores no se guarda ninguna y se devuelven los errores por fila (número de fila de la tabla, desde 1).
 * El inventario inicial se registra como movimiento "inventario inicial" (lo hace Inventario por evento).
 */
export async function bulkCreateItems(rows: BulkRow[]): Promise<{ created: number; errors: BulkError[] }> {
  const filled = rows.map((r, i) => ({ r, row: i + 1 })).filter(({ r }) => r.name.trim() !== "");
  if (filled.length === 0) throw new DomainError("La tabla está vacía.");

  return runInTransaction(async (tx, publish) => {
    const errors: BulkError[] = [];
    const categories = await tx.category.findMany({ select: { id: true, name: true } });
    const categoryId = new Map(categories.map((c) => [textKey(c.name), c.id]));
    const existing = await tx.product.findMany({ select: { name: true, categoryId: true } });
    const taken = new Set(existing.map((p) => `${p.categoryId}|${textKey(p.name)}`));
    const initial: { productId: string; initialQuantity: Decimal; unitCostCents: Decimal | null }[] = [];
    let created = 0;

    for (const { r, row } of filled) {
      const type = parseItemType(r.type);
      const baseUnit = parseBaseUnit(r.unit || "unidad");
      if (!type) {
        errors.push({ row, message: `Tipo "${r.type}" no válido` });
        continue;
      }
      if (!baseUnit) {
        errors.push({ row, message: `Unidad "${r.unit}" no válida` });
        continue;
      }
      const catName = r.category.trim() || "Sin categoría";
      let catId = categoryId.get(textKey(catName));
      if (!catId) {
        catId = (await tx.category.create({ data: { name: catName, sortOrder: 100 + categoryId.size } })).id;
        categoryId.set(textKey(catName), catId);
      }
      const key = `${catId}|${textKey(r.name)}`;
      if (taken.has(key)) {
        errors.push({ row, message: `"${r.name}" ya existe en ${catName}` });
        continue;
      }
      const parsed = productInput.safeParse({
        name: r.name,
        categoryId: catId,
        type,
        priceCents: r.price,
        sendsToKitchen: type === "PREPARED",
        active: true,
        baseUnit,
        tracksStock: parseYesNo(r.tracksStock),
        minStock: r.minStock,
        lastCostCents: r.lastCost,
      });
      if (!parsed.success) {
        errors.push({ row, message: parsed.error.issues.map((i) => i.message).join(", ") });
        continue;
      }
      let initialQuantity: Decimal | null = null;
      if (r.initialStock.trim()) {
        try {
          initialQuantity = parseQuantity(r.initialStock);
        } catch {
          errors.push({ row, message: "Inventario inicial inválido" });
          continue;
        }
        if (!parsed.data.tracksStock && !initialQuantity.isZero()) {
          errors.push({ row, message: "Tiene inventario inicial pero no maneja stock (marca \"Suma stock\")" });
          continue;
        }
      }
      if (errors.length > 0) continue; // ya no se va a guardar: solo se siguen juntando errores
      const product = await tx.product.create({ data: { ...parsed.data, sortOrder: 1000 + created } });
      taken.add(key);
      created++;
      if (initialQuantity && !initialQuantity.isZero()) {
        initial.push({ productId: product.id, initialQuantity, unitCostCents: parsed.data.lastCostCents });
      }
    }

    if (errors.length > 0) {
      // Deshace todo (runInTransaction hace rollback al lanzar). Se devuelven los errores por fila.
      throw new BulkImportError(errors);
    }
    if (initial.length > 0) {
      await publish("catalog.items_imported", {
        items: initial.map((i) => ({
          productId: i.productId,
          initialQuantity: i.initialQuantity.toString(),
          unitCostCents: i.unitCostCents?.toString() ?? null,
        })),
      });
    }
    return { created, errors: [] };
  }).catch((error) => {
    if (error instanceof BulkImportError) return { created: 0, errors: error.errors };
    throw error;
  });
}

class BulkImportError extends Error {
  constructor(public readonly errors: BulkError[]) {
    super("Errores en la carga rápida");
  }
}

/** Para la plantilla: una fila de ejemplo por tipo. */
export const TEMPLATE_EXAMPLES: string[][] = [
  ["Carne molida", "Insumo", "Carnes", "kg", "sí", "2", "52", "", "5"],
  ["Pan de hamburguesa", "Insumo", "Panadería", "unidad", "sí", "24", "1,5", "", "48"],
  ["Medallón de carne", "Ingrediente", "Hamburguesas", "unidad", "sí", "10", "6,5", "", "20"],
  ["Coca Cola 500 ml", "Normal", "Bebidas", "unidad", "sí", "12", "6", formatMoneyInput(900), "24"],
  ["Hamburguesa Clásica", "Preparado", "Hamburguesas", "unidad", "no", "", "", "40", ""],
];
