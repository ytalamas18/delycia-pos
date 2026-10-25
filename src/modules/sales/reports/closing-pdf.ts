import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

import { appConfig } from "@/core/config/app";
import { formatMoney } from "@/core/money";
import type { PaymentMethod } from "@/generated/prisma/enums";

import type { DailySummary } from "../domain/closing";
import { paymentMethodLabel } from "../domain/labels";

export type ClosingPdfData = {
  date: string;
  summary: DailySummary;
  opening: { openingCashCents: number; openedByName: string | null; openedAt: Date } | null;
  closing: {
    expectedCashCents: number;
    countedCashCents: number;
    differenceCents: number;
    expectedQrCents: number;
    countedQrCents: number | null;
    expectedCardCents: number;
    countedCardCents: number | null;
    notes: string | null;
    closedAt: Date;
  } | null;
  closedByName: string | null;
  generatedAt: Date;
};

const METHODS: PaymentMethod[] = ["CASH", "QR", "CARD", "PEYA", "CREDIT"];
const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const GRAY = rgb(0.4, 0.4, 0.4);
const LINE = rgb(0.85, 0.85, 0.85);

const dateTime = new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short", timeZone: appConfig.timezone });
const longDate = new Intl.DateTimeFormat("es-BO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Las fuentes estándar de PDF solo cubren Latin-1 (WinAnsi): tildes y ñ funcionan,
 * pero emojis o símbolos raros romperían el PDF. Se reemplazan por "?".
 */
function safe(text: string) {
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

/** Escritor sencillo de arriba hacia abajo que agrega páginas solo cuando hace falta. */
class Writer {
  page!: PDFPage;
  y = 0;

  constructor(
    private doc: PDFDocument,
    private font: PDFFont,
    private bold: PDFFont,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.y = A4.height - MARGIN;
  }

  ensure(space: number) {
    if (this.y - space < MARGIN) this.newPage();
  }

  text(text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number } = {}) {
    const size = opts.size ?? 10;
    this.ensure(size + 4);
    this.page.drawText(safe(text), {
      x: opts.x ?? MARGIN,
      y: this.y - size,
      size,
      font: opts.bold ? this.bold : this.font,
      color: opts.color,
    });
    this.y -= size + 5;
  }

  /** Fila con columnas: la primera a la izquierda, el resto alineadas a la derecha. */
  row(cells: string[], widths: number[], opts: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> } = {}) {
    const size = opts.size ?? 10;
    this.ensure(size + 6);
    const font = opts.bold ? this.bold : this.font;
    let x = MARGIN;
    cells.forEach((cell, i) => {
      const value = safe(cell);
      const w = widths[i];
      const tx = i === 0 ? x : x + w - font.widthOfTextAtSize(value, size);
      this.page.drawText(value, { x: tx, y: this.y - size, size, font, color: opts.color });
      x += w;
    });
    this.y -= size + 6;
  }

  rule() {
    this.ensure(8);
    this.page.drawLine({
      start: { x: MARGIN, y: this.y - 2 },
      end: { x: A4.width - MARGIN, y: this.y - 2 },
      thickness: 0.6,
      color: LINE,
    });
    this.y -= 8;
  }

  gap(h = 8) {
    this.y -= h;
  }

  section(title: string) {
    this.gap(6);
    this.ensure(40);
    this.text(title, { size: 13, bold: true });
    this.rule();
  }
}

/** PDF del cierre de caja del día, con el reporte de productos vendidos por categoría. */
export async function buildClosingPdf(data: ClosingPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Cierre de caja ${data.date} - ${appConfig.businessName}`);
  doc.setAuthor(appConfig.businessName);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);
  const s = data.summary;
  const full = A4.width - MARGIN * 2;

  // Encabezado
  w.text(`${appConfig.businessName} - Cierre de caja`, { size: 18, bold: true });
  w.text(longDate.format(new Date(`${data.date}T12:00:00Z`)), { size: 12 });
  w.text(`${appConfig.ticket.address} · Tel. ${appConfig.ticket.phone}`, { size: 9, color: GRAY });
  w.gap(4);

  // Apertura
  w.section("Apertura de caja");
  if (data.opening) {
    w.row(["Efectivo inicial", formatMoney(data.opening.openingCashCents)], [full - 120, 120], { bold: true });
    w.text(`Abrió ${data.opening.openedByName ?? "-"} el ${dateTime.format(data.opening.openedAt)}`, { size: 9, color: GRAY });
  } else {
    w.text("No se registró apertura de caja este día (fondo inicial = Bs 0).", { color: GRAY });
  }

  // Resumen
  w.section("Resumen de ventas");
  const two = [full - 120, 120];
  w.row(["Órdenes cobradas", String(s.paidCount)], two);
  w.row(["Ventas brutas", formatMoney(s.grossCents)], two);
  w.row(["Descuentos", `- ${formatMoney(s.discountCents)}`], two);
  w.row(["Ventas netas", formatMoney(s.netCents)], two, { bold: true, size: 12 });
  w.row(["Ticket promedio", formatMoney(s.averageTicketCents)], two);
  w.row([`Local (${s.byChannel.LOCAL.count} órdenes)`, formatMoney(s.byChannel.LOCAL.netCents)], two);
  w.row([`PEYA (${s.byChannel.PEYA.count} órdenes)`, formatMoney(s.byChannel.PEYA.netCents)], two);
  if (s.openCount > 0) {
    w.row([`Quedaron por pagar (${s.openCount}) - no incluidas`, formatMoney(s.openTotalCents)], two, { color: GRAY });
  }
  if (s.cancelledCount > 0) {
    w.row([`Órdenes anuladas (${s.cancelledCount}) - no incluidas`, formatMoney(s.cancelledCents)], two, { color: GRAY });
  }
  if (s.refundedCents > 0) w.row(["  de ellas, cobradas y devueltas", formatMoney(s.refundedCents)], two, { color: GRAY });
  if (s.voidedItemsCount > 0) {
    w.row([`Ítems anulados (${s.voidedItemsCount}) - no incluidos`, formatMoney(s.voidedItemsCents)], two, { color: GRAY });
  }

  // Dinero por medio
  w.section("Dinero por medio de pago");
  const four = [full - 330, 110, 110, 110];
  w.row(["Medio", "Ventas", "Cobro fiados", "Entró"], four, { bold: true, size: 9 });
  for (const m of METHODS) {
    w.row(
      [
        paymentMethodLabel[m],
        formatMoney(s.salesByMethod[m]),
        m === "CREDIT" ? "-" : formatMoney(s.collectionsByMethod[m]),
        m === "CREDIT" ? "-" : formatMoney(s.moneyInByMethod[m]),
      ],
      four,
    );
  }
  w.text("Cuenta por cobrar = lo que quedó fiado hoy: es venta, pero no dinero que entró.", { size: 8, color: GRAY });

  // Pagos a proveedores (Compras)
  const out = s.supplierPayments;
  if (out && out.totalCents > 0) {
    w.section("Pagos a proveedores");
    const methodName = { CASH: "Efectivo", TRANSFER: "Transferencia/QR", CARD: "Tarjeta" } as const;
    for (const p of out.payments) {
      w.row([`Compra #${p.purchaseNumber}${p.supplier ? ` - ${p.supplier}` : ""} (${methodName[p.method]})`, `- ${formatMoney(p.amountCents)}`], two);
    }
    w.row(["En efectivo (sale de la caja)", `- ${formatMoney(out.cashCents)}`], two, { bold: true });
  }

  // Arqueo
  w.section("Arqueo");
  if (data.closing) {
    const c = data.closing;
    const diffText = (d: number) => (d === 0 ? "Cuadra" : `${d < 0 ? "Falta" : "Sobra"} ${formatMoney(Math.abs(d))}`);
    w.row(["Medio", "Sistema", "Contado", "Diferencia"], four, { bold: true, size: 9 });
    w.row(["Efectivo (fondo + entradas - pagos)", formatMoney(c.expectedCashCents), formatMoney(c.countedCashCents), diffText(c.differenceCents)], four);
    if (c.countedQrCents !== null) {
      w.row(["QR (banco)", formatMoney(c.expectedQrCents), formatMoney(c.countedQrCents), diffText(c.countedQrCents - c.expectedQrCents)], four);
    }
    if (c.countedCardCents !== null) {
      w.row(
        ["Tarjeta (datáfono)", formatMoney(c.expectedCardCents), formatMoney(c.countedCardCents), diffText(c.countedCardCents - c.expectedCardCents)],
        four,
      );
    }
    if (c.notes) w.text(`Observaciones: ${c.notes}`, { size: 9 });
    w.text(`Cerró ${data.closedByName ?? "-"} el ${dateTime.format(c.closedAt)}`, { size: 9, color: GRAY });
  } else {
    w.text("Todavía no se guardó el arqueo de este día.", { color: GRAY });
  }

  // Productos vendidos
  w.section("Productos vendidos");
  if (s.productsByCategory.length === 0) {
    w.text("Sin ventas cobradas este día.", { color: GRAY });
  } else {
    const three = [full - 200, 80, 120];
    w.row(["Producto", "Cantidad", "Monto"], three, { bold: true, size: 9 });
    for (const cat of s.productsByCategory) {
      w.gap(2);
      w.row([cat.category, String(cat.quantity), formatMoney(cat.amountCents)], three, { bold: true });
      for (const p of cat.products) w.row([`   ${p.name}`, String(p.quantity), formatMoney(p.amountCents)], three, { size: 9 });
    }
    w.rule();
    w.row(
      ["Total", String(s.products.reduce((a, p) => a + p.quantity, 0)), formatMoney(s.products.reduce((a, p) => a + p.amountCents, 0))],
      three,
      { bold: true },
    );
    w.text("Montos de productos antes de descuentos de la orden.", { size: 8, color: GRAY });
  }

  w.gap(10);
  w.text(`Generado el ${dateTime.format(data.generatedAt)}`, { size: 8, color: GRAY });
  return doc.save();
}

/** CSV de productos vendidos para Excel (separador ";" y coma decimal, como usa Excel en español). */
export function productsCsv(summary: DailySummary): string {
  const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  const rows = [["Categoria", "Producto", "Cantidad", "Monto Bs"]];
  for (const cat of summary.productsByCategory) {
    for (const p of cat.products) rows.push([cat.category, p.name, String(p.quantity), money(p.amountCents)]);
  }
  const escape = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  // BOM para que Excel reconozca UTF-8 (tildes y ñ).
  return "﻿" + rows.map((r) => r.map(escape).join(";")).join("\r\n") + "\r\n";
}
