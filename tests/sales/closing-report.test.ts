import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { summarizeDay } from "@/modules/sales/domain/closing";
import { buildClosingPdf, productsCsv } from "@/modules/sales/reports/closing-pdf";

const summary = summarizeDay(
  [
    {
      status: "CLOSED",
      channel: "LOCAL",
      subtotalCents: 5200,
      discountCents: 0,
      totalCents: 5200,
      items: [
        { productName: "Hamburguesa Clásica Simple", quantity: 1, unitPriceCents: 4000, status: "ACTIVE", category: { name: "Hamburguesas", sortOrder: 0 } },
        { productName: "Extra queso", quantity: 1, unitPriceCents: 300, status: "ACTIVE", category: { name: "Extras", sortOrder: 7 } },
        { productName: "Coca Cola 500 ml", quantity: 1, unitPriceCents: 900, status: "ACTIVE", category: { name: "Bebidas", sortOrder: 8 } },
      ],
      payments: [{ method: "CASH", amountCents: 5200, refundedAt: null }],
    },
  ],
  [],
);

describe("reporte de cierre", () => {
  it("genera un PDF válido aunque haya textos con tildes, ñ o símbolos raros", async () => {
    const bytes = await buildClosingPdf({
      date: "2026-10-17",
      summary,
      opening: { openingCashCents: 20000, openedByName: "Caja", openedAt: new Date() },
      closing: {
        expectedCashCents: 25200,
        countedCashCents: 25000,
        differenceCents: -200,
        expectedQrCents: 0,
        countedQrCents: 0,
        expectedCardCents: 0,
        countedCardCents: null,
        notes: "Pagó el gas ✔ con caja — señora Ñusta",
        closedAt: new Date(),
      },
      closedByName: "Caja",
      generatedAt: new Date(),
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(doc.getTitle()).toContain("2026-10-17");
  });

  it("CSV para Excel en español: BOM, separador ';' y coma decimal, por categoría", () => {
    const csv = productsCsv(summary);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.slice(1).trimEnd().split("\r\n")).toEqual([
      "Categoria;Producto;Cantidad;Monto Bs",
      "Hamburguesas;Hamburguesa Clásica Simple;1;40,00",
      "Extras;Extra queso;1;3,00",
      "Bebidas;Coca Cola 500 ml;1;9,00",
    ]);
  });
});
