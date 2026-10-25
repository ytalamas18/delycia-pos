import ExcelJS from "exceljs";

import { DomainError } from "@/core/errors";

import { BULK_COLUMNS, parseCsv, rowsFromTable, type BulkRow } from "../domain/bulk";
import { TEMPLATE_EXAMPLES } from "./bulk";

/** Lee un .xlsx o .csv subido y devuelve las filas para revisar en la tabla (no guarda nada). */
export async function readImportFile(file: File): Promise<BulkRow[]> {
  if (file.size === 0) throw new DomainError("El archivo está vacío.");
  if (file.size > 2 * 1024 * 1024) throw new DomainError("El archivo es muy grande (máximo 2 MB).");
  const name = file.name.toLowerCase();
  let table: string[][];
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    table = parseCsv(await file.text());
  } else if (name.endsWith(".xlsx")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) throw new DomainError("El Excel no tiene hojas.");
    table = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values as unknown[];
      table.push(values.slice(1).map((v) => cellText(v)));
    });
  } else {
    throw new DomainError("Sube un archivo .xlsx o .csv (usa la plantilla).");
  }
  try {
    return rowsFromTable(table);
  } catch (error) {
    throw new DomainError((error as Error).message);
  }
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v).replace(".", ",");
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "result" in (v as object)) return cellText((v as { result: unknown }).result);
  if (typeof v === "object" && "text" in (v as object)) return String((v as { text: unknown }).text);
  return String(v);
}

/** Plantilla .xlsx con encabezados, ejemplos e instrucciones. */
export async function buildImportTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ítems");
  ws.addRow(BULK_COLUMNS.map((c) => c.header));
  ws.getRow(1).font = { bold: true };
  for (const ex of TEMPLATE_EXAMPLES) ws.addRow(ex);
  ws.columns.forEach((col, i) => (col.width = Math.max(BULK_COLUMNS[i].header.length + 4, 16)));
  const help = wb.addWorksheet("Instrucciones");
  help.addRow(["Columna", "Qué poner"]);
  help.getRow(1).font = { bold: true };
  for (const c of BULK_COLUMNS) help.addRow([c.header, c.hint]);
  help.addRow([]);
  help.addRow(["Nota", "Borra las filas de ejemplo antes de importar. Los decimales pueden ir con coma (1,5)."]);
  help.getColumn(1).width = 22;
  help.getColumn(2).width = 70;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
