import ExcelJS from "exceljs";

import { appConfig } from "../config/app";

import { cellText, formatDateTime, dayToDate, wallClock } from "./format";
import type { ColumnType, ExportCell, ExportDocument, ExportTable } from "./types";

const NUM_FMT: Partial<Record<ColumnType, string>> = {
  int: "#,##0",
  money: '"Bs" #,##0.00',
  percent: "0%",
  date: "dd/mm/yyyy",
  datetime: "dd/mm/yyyy hh:mm",
};

/** Valor REAL para Excel (número o fecha), no texto: así se puede sumar, filtrar y hacer tablas dinámicas. */
function excelValue(value: ExportCell, type: ColumnType): ExcelJS.CellValue {
  if (value === null || value === "") return null;
  if (type === "money" && typeof value === "number") return value / 100;
  if (type === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return dayToDate(value);
  if (value instanceof Date) return wallClock(value);
  return value;
}

/** Nombre de hoja válido: máx. 31 caracteres, sin \ / ? * [ ] : y sin repetir. */
function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Hoja";
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28)} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

function addTableSheet(wb: ExcelJS.Workbook, doc: ExportDocument, table: ExportTable, name: string) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 5 }] });
  const n = table.columns.length;

  // Encabezado del documento (filas 1-3) y fila 4 vacía; la tabla empieza en la fila 5.
  ws.getCell(1, 1).value = `${appConfig.businessName} — ${doc.report}`;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.getCell(2, 1).value = [doc.period, ...(doc.filters ?? [])].join(" · ");
  ws.getCell(3, 1).value = `Generado: ${formatDateTime(doc.generatedAt)}`;
  ws.getCell(3, 1).font = { italic: true, color: { argb: "FF666666" } };

  const header = ws.getRow(5);
  table.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB5482A" } };
    cell.alignment = {
      vertical: "middle",
      horizontal: c.type === "int" || c.type === "money" || c.type === "percent" ? "right" : "left",
      wrapText: true,
    };
  });

  table.rows.forEach((row, r) => {
    const xr = ws.getRow(6 + r);
    table.columns.forEach((c, i) => {
      const cell = xr.getCell(i + 1);
      cell.value = excelValue(row[i] ?? null, c.type);
      if (NUM_FMT[c.type]) cell.numFmt = NUM_FMT[c.type]!;
    });
  });

  if (table.rows.length > 0) ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5 + table.rows.length, column: n } };

  if (table.totals) {
    const tr = ws.getRow(6 + table.rows.length);
    table.columns.forEach((c, i) => {
      const cell = tr.getCell(i + 1);
      cell.value = excelValue(table.totals![i] ?? null, c.type);
      if (NUM_FMT[c.type]) cell.numFmt = NUM_FMT[c.type]!;
      cell.font = { bold: true };
      cell.border = { top: { style: "medium" } };
    });
  }

  // Ancho de columnas: por el texto más largo (encabezado, celdas y totales), con tope.
  table.columns.forEach((c, i) => {
    const texts = [c.header, ...table.rows.map((r) => cellText(r[i] ?? null, c.type)), cellText(table.totals?.[i] ?? null, c.type)];
    const longest = Math.max(...texts.map((t) => t.length));
    ws.getColumn(i + 1).width = Math.min(Math.max(c.width ?? longest + 2, 10), 60);
  });
}

export async function renderXlsx(doc: ExportDocument): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = appConfig.businessName;
  wb.created = doc.generatedAt;
  const used = new Set<string>();

  if (doc.summary?.length) {
    const ws = wb.addWorksheet(sheetName("Resumen", used));
    ws.getCell(1, 1).value = `${appConfig.businessName} — ${doc.report}`;
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    ws.getCell(2, 1).value = [doc.period, ...(doc.filters ?? [])].join(" · ");
    ws.getCell(3, 1).value = `Generado: ${formatDateTime(doc.generatedAt)}`;
    ws.getCell(3, 1).font = { italic: true, color: { argb: "FF666666" } };
    doc.summary.forEach((s, i) => {
      const row = ws.getRow(5 + i);
      row.getCell(1).value = s.label;
      row.getCell(1).font = { bold: true };
      row.getCell(2).value = excelValue(s.value, s.type);
      if (NUM_FMT[s.type]) row.getCell(2).numFmt = NUM_FMT[s.type]!;
    });
    ws.getColumn(1).width = Math.max(...doc.summary.map((s) => s.label.length), 20) + 2;
    ws.getColumn(2).width = 18;
  }

  for (const table of doc.tables) addTableSheet(wb, doc, table, sheetName(table.title, used));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
