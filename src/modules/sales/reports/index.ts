import { getDailyClosing } from "../services/history";
import { buildClosingPdf, productsCsv } from "./closing-pdf";

/** Arma el archivo del cierre del día (PDF completo o CSV de productos). */
export async function getClosingReport(date: string, format: "pdf" | "csv") {
  const { summary, saved, closedByName, opening } = await getDailyClosing(date);
  if (format === "csv") {
    return {
      body: productsCsv(summary),
      contentType: "text/csv; charset=utf-8",
      filename: `delycia-productos-${date}.csv`,
    };
  }
  const pdf = await buildClosingPdf({
    date,
    summary,
    opening: opening ? { openingCashCents: opening.openingCashCents, openedByName: opening.openedByName, openedAt: opening.openedAt } : null,
    closing: saved,
    closedByName,
    generatedAt: new Date(),
  });
  return { body: pdf, contentType: "application/pdf", filename: `delycia-cierre-${date}.pdf` };
}
