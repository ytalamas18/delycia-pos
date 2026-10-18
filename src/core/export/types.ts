/**
 * Descripción de un documento exportable. Cada reporte arma UNA de estas y de ahí salen
 * el Excel y el PDF: así ningún reporte repite código de exportación.
 */

/** Tipo de dato de una columna: decide el formato en Excel (valor real) y en PDF (texto). */
export type ColumnType =
  | "text"
  /** entero */
  | "int"
  /** centavos (Int) → Bs con 2 decimales */
  | "money"
  /** día "YYYY-MM-DD" */
  | "date"
  /** instante (Date) → fecha y hora del local */
  | "datetime"
  /** 0..1 */
  | "percent";

export type ExportColumn = {
  header: string;
  type: ColumnType;
  /** Ancho relativo (aprox. caracteres). Si falta, se calcula por el contenido. */
  width?: number;
};

export type ExportCell = string | number | Date | null;

export type ExportTable = {
  /** Nombre de la hoja en Excel y título de la tabla en el PDF. */
  title: string;
  columns: ExportColumn[];
  rows: ExportCell[][];
  /** Fila de totales (misma cantidad de celdas que columnas; null = vacío). */
  totals?: ExportCell[];
  /** Notas cortas bajo la tabla (solo PDF). */
  notes?: string[];
};

export type ExportSummaryItem = { label: string; value: ExportCell; type: ColumnType };

export type ExportDocument = {
  /** "Ventas por canal" */
  report: string;
  /** Nombre del archivo sin extensión, ej. "ventas-por-canal_2026-10-01_2026-10-18". */
  fileBase: string;
  /** "Del 01/10/2026 al 18/10/2026" */
  period: string;
  /** Filtros aplicados, para que el archivo diga exactamente qué se exportó. */
  filters?: string[];
  generatedAt: Date;
  summary?: ExportSummaryItem[];
  tables: ExportTable[];
};

export type ExportFormat = "xlsx" | "pdf";
