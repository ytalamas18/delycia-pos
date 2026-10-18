// Exportación reutilizable: cada reporte arma un ExportDocument y esto genera Excel o PDF.
export type { ColumnType, ExportCell, ExportColumn, ExportDocument, ExportFormat, ExportTable } from "./types";
export { fileBaseFor, formatDay, formatPeriod } from "./format";
export { renderPdf } from "./pdf";
export { renderXlsx } from "./xlsx";
export { exportResponse, parseExportFormat } from "./response";
