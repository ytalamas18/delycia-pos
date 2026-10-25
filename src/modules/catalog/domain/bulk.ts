// Sin Decimal: se usa también en el cliente (tabla de carga rápida).
import type { BaseUnit, ItemType } from "@/generated/prisma/enums";

import { ITEM_TYPE_LABEL, ITEM_TYPES } from "./item-types";
import { textKey } from "./text";
import { BASE_UNITS, UNIT_LABEL } from "./unit-labels";

/** Una fila de la carga rápida tal como se escribe (todo texto, se valida al guardar). */
export type BulkRow = {
  name: string;
  type: string;
  category: string;
  unit: string;
  tracksStock: string;
  minStock: string;
  lastCost: string;
  price: string;
  initialStock: string;
};

export const BULK_COLUMNS: { key: keyof BulkRow; header: string; hint: string }[] = [
  { key: "name", header: "Nombre", hint: "Ej. Carne molida" },
  { key: "type", header: "Tipo", hint: "Normal, Preparado, Ingrediente o Insumo" },
  { key: "category", header: "Categoría", hint: "Se crea si no existe" },
  { key: "unit", header: "Unidad", hint: "unidad, kg, g, litro o ml" },
  { key: "tracksStock", header: "Suma stock", hint: "sí / no (Ingrediente siempre sí)" },
  { key: "minStock", header: "Stock mínimo", hint: "Opcional" },
  { key: "lastCost", header: "Último costo (Bs)", hint: "Por unidad base, opcional" },
  { key: "price", header: "Precio venta (Bs)", hint: "Solo Normal y Preparado" },
  { key: "initialStock", header: "Inventario inicial", hint: "Opcional, en unidad base" },
];

export const emptyBulkRow = (): BulkRow => ({
  name: "",
  type: "Insumo",
  category: "",
  unit: "unidad",
  tracksStock: "sí",
  minStock: "",
  lastCost: "",
  price: "",
  initialStock: "",
});

export function parseItemType(text: string): ItemType | null {
  const key = textKey(text);
  return ITEM_TYPES.find((t) => textKey(ITEM_TYPE_LABEL[t]) === key || t.toLowerCase() === key) ?? null;
}

export function parseBaseUnit(text: string): BaseUnit | null {
  const aliases: Record<string, BaseUnit> = { u: "UNIT", unidad: "UNIT", und: "UNIT", kilo: "KG", kg: "KG", g: "G", gr: "G", gramo: "G", l: "L", lt: "L", litro: "L", ml: "ML" };
  const raw = textKey(text);
  // Plurales: "unidades" → "unidad", "gramos" → "gramo".
  for (const key of [raw, raw.replace(/es$/, ""), raw.replace(/s$/, "")]) {
    const unit = aliases[key] ?? BASE_UNITS.find((u) => textKey(UNIT_LABEL[u]) === key || u.toLowerCase() === key);
    if (unit) return unit;
  }
  return null;
}

export function parseYesNo(text: string): boolean {
  return ["si", "sí", "s", "x", "1", "true", "yes"].includes(textKey(text));
}

/**
 * Tabla leída de un Excel/CSV (primera fila = encabezados) → filas de carga rápida.
 * Reconoce los encabezados de la plantilla sin importar mayúsculas ni tildes; ignora filas vacías.
 */
export function rowsFromTable(table: string[][]): BulkRow[] {
  if (table.length === 0) return [];
  const headers = table[0].map((h) => textKey(h));
  const index = Object.fromEntries(BULK_COLUMNS.map((c) => [c.key, headers.indexOf(textKey(c.header))])) as Record<keyof BulkRow, number>;
  if (index.name < 0) throw new Error('Falta la columna "Nombre": usa la plantilla.');
  return table
    .slice(1)
    .filter((cells) => cells.some((c) => String(c ?? "").trim() !== ""))
    .map((cells) => {
      const row = emptyBulkRow();
      for (const c of BULK_COLUMNS) if (index[c.key] >= 0) row[c.key] = String(cells[index[c.key]] ?? "").trim();
      return row;
    });
}

/** CSV simple (separador ; o ,; comillas dobles). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
