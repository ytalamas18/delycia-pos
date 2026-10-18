import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

import { appConfig } from "../config/app";

import { cellText, formatDateTime } from "./format";
import type { ExportColumn, ExportDocument, ExportTable } from "./types";

const PORTRAIT = { width: 595.28, height: 841.89 }; // A4
const MARGIN = 36;
const FONT_SIZE = 8.5;
const ROW_H = 15;
const GRAY = rgb(0.4, 0.4, 0.4);
const LINE = rgb(0.85, 0.85, 0.85);
const HEAD_BG = rgb(0.93, 0.9, 0.88);
const ZEBRA = rgb(0.97, 0.97, 0.97);

/**
 * Las fuentes estándar del PDF solo cubren Latin-1 (WinAnsi): tildes y ñ sí; el resto se reemplaza
 * (guiones largos, comillas tipográficas) o se cambia por "?" para no romper el archivo.
 */
function safe(text: string): string {
  return text
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

/** Corta el texto con "..." para que entre en el ancho. */
function fit(text: string, font: PDFFont, size: number, width: number): string {
  let t = safe(text);
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1);
  return `${t}...`;
}

class TableWriter {
  page!: PDFPage;
  y = 0;
  pageNumber = 0;
  readonly size: { width: number; height: number };

  constructor(
    private pdf: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
    private doc: ExportDocument,
    landscape: boolean,
  ) {
    this.size = landscape ? { width: PORTRAIT.height, height: PORTRAIT.width } : PORTRAIT;
    this.newPage();
  }

  get contentWidth() {
    return this.size.width - MARGIN * 2;
  }

  newPage() {
    this.page = this.pdf.addPage([this.size.width, this.size.height]);
    this.pageNumber += 1;
    this.y = this.size.height - MARGIN;
    // Encabezado en cada página.
    this.draw(`${appConfig.businessName} — ${this.doc.report}`, MARGIN, 14, { bold: true });
    this.y -= 18;
    this.draw([this.doc.period, ...(this.doc.filters ?? [])].join(" · "), MARGIN, 9);
    this.y -= 12;
    this.draw(`Generado: ${formatDateTime(this.doc.generatedAt)} · Página ${this.pageNumber}`, MARGIN, 8, { color: GRAY });
    this.y -= 14;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: this.size.width - MARGIN, y: this.y },
      thickness: 0.5,
      color: LINE,
    });
    this.y -= 10;
  }

  draw(text: string, x: number, size: number, opts: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) {
    this.page.drawText(safe(text), { x, y: this.y - size, size, font: opts.bold ? this.bold : this.font, color: opts.color });
  }

  ensure(space: number): boolean {
    if (this.y - space < MARGIN) {
      this.newPage();
      return true;
    }
    return false;
  }

  summary(items: NonNullable<ExportDocument["summary"]>) {
    const colW = this.contentWidth / Math.min(items.length, 4);
    for (let i = 0; i < items.length; i += 4) {
      this.ensure(32);
      items.slice(i, i + 4).forEach((s, j) => {
        const x = MARGIN + j * colW;
        this.page.drawText(fit(s.label, this.font, 8, colW - 8), { x, y: this.y - 8, size: 8, font: this.font, color: GRAY });
        this.page.drawText(fit(cellText(s.value, s.type), this.bold, 13, colW - 8), {
          x,
          y: this.y - 24,
          size: 13,
          font: this.bold,
        });
      });
      this.y -= 34;
    }
    this.y -= 6;
  }

  table(t: ExportTable) {
    const widths = columnWidths(t, this.contentWidth, this.font, this.bold);
    this.ensure(ROW_H * 3 + 20);
    this.draw(t.title, MARGIN, 11, { bold: true });
    this.y -= 18;
    this.headerRow(t.columns, widths);
    t.rows.forEach((row, r) => {
      if (this.ensure(ROW_H)) this.headerRow(t.columns, widths);
      if (r % 2 === 1) this.band(ZEBRA);
      this.row(t.columns, widths, row.map((v, i) => cellText(v ?? null, t.columns[i].type)), false);
    });
    if (t.rows.length === 0) {
      this.draw("Sin datos en este período.", MARGIN + 4, FONT_SIZE, { color: GRAY });
      this.y -= ROW_H;
    }
    if (t.totals) {
      if (this.ensure(ROW_H + 2)) this.headerRow(t.columns, widths);
      this.page.drawLine({
        start: { x: MARGIN, y: this.y },
        end: { x: MARGIN + this.contentWidth, y: this.y },
        thickness: 1,
      });
      this.row(t.columns, widths, t.totals.map((v, i) => cellText(v ?? null, t.columns[i].type)), true);
    }
    for (const note of t.notes ?? []) {
      this.ensure(12);
      this.draw(note, MARGIN, 7.5, { color: GRAY });
      this.y -= 11;
    }
    this.y -= 14;
  }

  private band(color: ReturnType<typeof rgb>) {
    this.page.drawRectangle({ x: MARGIN, y: this.y - ROW_H + 3, width: this.contentWidth, height: ROW_H, color });
  }

  private headerRow(columns: ExportColumn[], widths: number[]) {
    this.band(HEAD_BG);
    this.row(columns, widths, columns.map((c) => c.header), true);
  }

  private row(columns: ExportColumn[], widths: number[], texts: string[], bold: boolean) {
    const font = bold ? this.bold : this.font;
    let x = MARGIN;
    columns.forEach((c, i) => {
      const w = widths[i];
      const text = fit(texts[i] ?? "", font, FONT_SIZE, w - 6);
      // Números a la derecha; texto y fechas a la izquierda.
      const right = c.type === "int" || c.type === "money" || c.type === "percent";
      const tx = right ? x + w - 3 - font.widthOfTextAtSize(text, FONT_SIZE) : x + 3;
      this.page.drawText(text, { x: tx, y: this.y - FONT_SIZE - 1, size: FONT_SIZE, font });
      x += w;
    });
    this.y -= ROW_H;
  }
}

/**
 * Ancho de cada columna según su contenido. Si no entra en la página, se achican SOLO las columnas
 * de texto (números, fechas y encabezados no se cortan); si sobra espacio, se reparte entre todas.
 */
function columnWidths(t: ExportTable, total: number, font: PDFFont, bold: PDFFont): number[] {
  const natural = t.columns.map((c, i) => {
    const texts = [...t.rows.slice(0, 300).map((r) => cellText(r[i] ?? null, c.type)), cellText(t.totals?.[i] ?? null, c.type)];
    const widest = Math.max(
      bold.widthOfTextAtSize(safe(c.header), FONT_SIZE),
      ...texts.map((x) => font.widthOfTextAtSize(safe(x), FONT_SIZE)),
    );
    return Math.min(widest + 10, c.type === "text" ? 260 : 120);
  });
  const sum = natural.reduce((s, w) => s + w, 0);
  if (sum <= total) return natural.map((w) => (w / sum) * total);
  const fixed = natural.reduce((s, w, i) => s + (t.columns[i].type === "text" ? 0 : w), 0);
  const flexible = sum - fixed;
  const room = Math.max(total - fixed, 0);
  const shrunk = natural.map((w, i) => (t.columns[i].type === "text" ? Math.max((w / flexible) * room, 40) : w));
  const shrunkSum = shrunk.reduce((s, w) => s + w, 0);
  return shrunk.map((w) => (w / shrunkSum) * total);
}

export async function renderPdf(doc: ExportDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${appConfig.businessName} — ${doc.report}`);
  pdf.setCreator(appConfig.businessName);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  // Muchas columnas → A4 apaisado para que se lea.
  const landscape = doc.tables.some((t) => t.columns.length > 7);
  const w = new TableWriter(pdf, font, bold, doc, landscape);
  if (doc.summary?.length) w.summary(doc.summary);
  for (const t of doc.tables) w.table(t);
  return pdf.save();
}
