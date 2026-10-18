import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { exportResponse, fileBaseFor, formatPeriod, renderPdf, renderXlsx, type ExportDocument } from "@/core/export";

const doc = (rows = 3): ExportDocument => ({
  report: "Ventas por canal",
  fileBase: fileBaseFor("ventas-por-canal", "2026-10-01", "2026-10-18"),
  period: formatPeriod("2026-10-01", "2026-10-18"),
  filters: ["Categoría: Todas"],
  generatedAt: new Date("2026-10-18T22:30:00Z"),
  summary: [{ label: "Total vendido", value: 123450, type: "money" }],
  tables: [
    {
      title: "Por día",
      columns: [
        { header: "Día", type: "date" },
        { header: "Hora", type: "datetime" },
        { header: "Canal", type: "text" },
        { header: "Órdenes", type: "int" },
        { header: "Total", type: "money" },
        { header: "%", type: "percent" },
      ],
      rows: Array.from({ length: rows }, (_, i) => [
        "2026-10-17",
        new Date("2026-10-18T03:30:00Z"), // 23:30 del 17 en La Paz
        i % 2 ? "QR" : "EFECTIVO — caja",
        2,
        3850,
        0.25,
      ]),
      totals: ["Total", null, null, rows * 2, rows * 3850, 1],
    },
  ],
});

describe("nombres y períodos", () => {
  it("archivo descriptivo y período legible", () => {
    expect(fileBaseFor("ventas-por-canal", "2026-10-01", "2026-10-18")).toBe("ventas-por-canal_2026-10-01_2026-10-18");
    expect(fileBaseFor("historial", "2026-10-18")).toBe("historial_2026-10-18");
    expect(formatPeriod("2026-10-01", "2026-10-18")).toBe("Del 01/10/2026 al 18/10/2026");
    expect(formatPeriod("2026-10-18", "2026-10-18")).toBe("18/10/2026");
  });
});

describe("Excel", () => {
  it("números y fechas como valores reales, totales, filtro y anchos", async () => {
    const wb = new ExcelJS.Workbook();
    const file = await renderXlsx(doc());
    await wb.xlsx.load(new Uint8Array(file).buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumen", "Por día"]);

    const resumen = wb.getWorksheet("Resumen")!;
    expect(resumen.getCell("A1").value).toBe("Delycia — Ventas por canal");
    expect(resumen.getCell("B5").value).toBe(1234.5);

    const ws = wb.getWorksheet("Por día")!;
    expect(ws.getCell("A2").value).toContain("Del 01/10/2026 al 18/10/2026");
    expect(ws.getRow(5).getCell(1).value).toBe("Día");
    const first = ws.getRow(6);
    expect(first.getCell(1).value).toEqual(new Date("2026-10-17T00:00:00Z"));
    expect(first.getCell(1).numFmt).toBe("dd/mm/yyyy");
    // La hora se escribe como se lee en La Paz (Excel no tiene zona horaria).
    expect(first.getCell(2).value).toEqual(new Date("2026-10-17T23:30:00Z"));
    expect(first.getCell(4).value).toBe(2);
    expect(first.getCell(5).value).toBe(38.5);
    expect(first.getCell(5).numFmt).toContain("0.00");
    expect(first.getCell(6).value).toBe(0.25);

    const totals = ws.getRow(9);
    expect(totals.getCell(1).value).toBe("Total");
    expect(totals.getCell(5).value).toBeCloseTo(115.5);
    expect(totals.getCell(5).font?.bold).toBe(true);
    expect(ws.autoFilter).toBeTruthy();
    expect(ws.getColumn(3).width).toBeGreaterThanOrEqual("EFECTIVO — caja".length);
  });
});

describe("PDF", () => {
  it("A4 válido; muchas filas = varias páginas", async () => {
    const one = await PDFDocument.load(await renderPdf(doc(3)));
    expect(one.getPageCount()).toBe(1);
    const [w, h] = [one.getPage(0).getWidth(), one.getPage(0).getHeight()];
    expect([Math.round(w), Math.round(h)]).toEqual([595, 842]);

    const many = await PDFDocument.load(await renderPdf(doc(120)));
    expect(many.getPageCount()).toBeGreaterThan(2);
  });

  it("la respuesta trae tipo y nombre de archivo", async () => {
    const res = await exportResponse(doc(), "xlsx");
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="ventas-por-canal_2026-10-01_2026-10-18.xlsx"');
    const pdf = await exportResponse(doc(), "pdf");
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
  });
});
