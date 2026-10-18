import { renderPdf } from "./pdf";
import type { ExportDocument, ExportFormat } from "./types";
import { renderXlsx } from "./xlsx";

const CONTENT_TYPE: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export function parseExportFormat(value: string | null): ExportFormat | null {
  return value === "xlsx" || value === "pdf" ? value : null;
}

/** Respuesta HTTP con el archivo listo para descargar. */
export async function exportResponse(doc: ExportDocument, format: ExportFormat): Promise<Response> {
  const body = format === "xlsx" ? await renderXlsx(doc) : await renderPdf(doc);
  const filename = `${doc.fileBase}.${format}`.replace(/[^\w.-]/g, "_");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": CONTENT_TYPE[format],
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
