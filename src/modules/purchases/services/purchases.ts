import { db } from "@/core/db/client";
import { runInTransaction, type Tx } from "@/core/db/transaction";
import { DomainError } from "@/core/errors";
import { parseMoney } from "@/core/money";
import { Decimal } from "@/core/quantity";
import { businessDate } from "@/core/time";
import type { Prisma } from "@/generated/prisma/client";
import type { SupplierPaymentMethod } from "@/generated/prisma/enums";
import { getPurchasableItem, setLastCost, toBaseQuantity, UNIT_LABEL, compatibleUnits, type BaseUnit } from "@/modules/catalog";

import { isOverdue, purchaseBalance } from "../domain/balance";
import { purchaseInput, reasonInput, supplierPaymentInput, type PurchaseInput, type SupplierPaymentInput } from "../schemas";

const purchaseInclude = {
  supplier: { select: { id: true, name: true } },
  lines: { orderBy: { createdAt: "asc" as const } },
  payments: { orderBy: [{ date: "asc" as const }, { createdAt: "asc" as const }] },
} satisfies Prisma.PurchaseInclude;

export type PurchaseWithDetail = Prisma.PurchaseGetPayload<{ include: typeof purchaseInclude }>;

/** Compra + saldo/estado calculados. */
function withBalance<P extends { totalCents: number; dueDate: string | null; payments: { amountCents: number; voidedAt: Date | null }[] }>(
  p: P,
  today = businessDate(),
) {
  const b = purchaseBalance(p.totalCents, p.payments);
  return {
    ...p,
    paidCents: b.paidCents,
    balanceCents: b.balanceCents,
    paymentStatus: b.status,
    overdue: isOverdue(p.dueDate, b.balanceCents, today),
  };
}

export async function getPurchase(id: string) {
  const p = await db.purchase.findUnique({ where: { id }, include: purchaseInclude });
  return p ? withBalance(p) : null;
}

export async function listPurchases(filters: { from?: string; to?: string; supplierId?: string | null } = {}) {
  const rows = await db.purchase.findMany({
    where: {
      date: { gte: filters.from, lte: filters.to },
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    },
    include: purchaseInclude,
    orderBy: [{ date: "desc" }, { number: "desc" }],
  });
  return rows.map((p) => withBalance(p));
}

/** Compras vigentes con saldo pendiente (cuentas por pagar), de la más antigua a la más nueva. */
export async function listPayables() {
  const rows = await db.purchase.findMany({
    where: { status: "ACTIVE" },
    include: purchaseInclude,
    orderBy: [{ date: "asc" }, { number: "asc" }],
  });
  return rows.map((p) => withBalance(p)).filter((p) => p.balanceCents > 0);
}

// ---------------------------------------------------------------------------
// Registrar una compra
// ---------------------------------------------------------------------------

type ResolvedLine = {
  productId: string;
  productName: string;
  presentationName: string;
  quantity: Decimal;
  baseQuantity: Decimal;
  totalCents: number;
  unitCostCents: Decimal;
  addsStock: boolean;
};

/** Convierte la línea escrita a unidad base del ítem y calcula el costo unitario. */
async function resolveLine(tx: Tx, line: ReturnType<typeof purchaseInput.parse>["lines"][number]): Promise<ResolvedLine> {
  const item = await getPurchasableItem(line.productId, tx);
  if (!item) throw new DomainError("Uno de los ítems no se puede comprar (un Preparado no se compra).");
  let presentationName: string;
  let baseQuantity: Decimal;
  if (line.presentation.startsWith("unit:")) {
    const unit = line.presentation.slice(5) as BaseUnit;
    if (!compatibleUnits(item.baseUnit).includes(unit)) throw new DomainError(`"${item.name}" no se mide en ${unit}.`);
    presentationName = UNIT_LABEL[unit];
    baseQuantity = toBaseQuantity(line.quantity, item.baseUnit, { unit });
  } else {
    const p = item.presentations.find((x) => x.id === line.presentation);
    if (!p) throw new DomainError(`La presentación de "${item.name}" ya no existe.`);
    presentationName = p.name;
    baseQuantity = toBaseQuantity(line.quantity, item.baseUnit, { presentationFactor: p.factor });
  }
  if (baseQuantity.lte(0)) throw new DomainError(`La cantidad de "${item.name}" es muy chica.`);
  return {
    productId: item.id,
    productName: item.name,
    presentationName,
    quantity: line.quantity,
    baseQuantity,
    totalCents: line.totalCents,
    unitCostCents: new Decimal(line.totalCents).div(baseQuantity).toDecimalPlaces(4),
    addsStock: item.tracksStock,
  };
}

/**
 * Registra la compra: el gasto queda por el total en su fecha; los ítems con stock suman (vía evento a
 * Inventario); se actualiza el último costo; y si fue al contado o con pago parcial se registra el pago.
 */
export async function createPurchase(input: PurchaseInput, userId: string) {
  const data = purchaseInput.parse(input);
  return runInTransaction(async (tx, publish) => {
    if (data.supplierId) {
      const s = await tx.supplier.findUnique({ where: { id: data.supplierId } });
      if (!s) throw new DomainError("El proveedor no existe", { supplierId: "Elige un proveedor" });
    }
    const lines: ResolvedLine[] = [];
    for (const line of data.lines) lines.push(await resolveLine(tx, line));
    const totalCents = lines.reduce((s, l) => s + l.totalCents, 0);

    let paidNow = 0;
    if (data.paymentMode === "CASH_FULL") paidNow = totalCents;
    if (data.paymentMode === "PARTIAL") {
      try {
        paidNow = parseMoney(data.paidNow ?? "");
      } catch {
        throw new DomainError("Ingresa cuánto se pagó ahora", { paidNow: "Monto inválido" });
      }
      if (paidNow <= 0 || paidNow >= totalCents) {
        throw new DomainError("El pago parcial debe ser mayor a 0 y menor al total.", { paidNow: "Monto inválido" });
      }
    }

    const purchase = await tx.purchase.create({
      data: {
        date: data.date,
        supplierId: data.supplierId,
        docType: data.docType,
        docNumber: data.docNumber,
        note: data.note,
        dueDate: data.paymentMode === "CASH_FULL" ? null : data.dueDate,
        totalCents,
        createdById: userId,
        lines: { create: lines },
        payments: paidNow > 0 ? { create: { date: data.date, amountCents: paidNow, method: data.paymentMethod, createdById: userId } } : undefined,
      },
      include: { lines: true },
    });

    // Último costo por ítem (si el mismo ítem viene en dos líneas, queda el de la última).
    for (const line of lines) await setLastCost(tx, line.productId, line.unitCostCents);

    await publish("purchase.registered", {
      purchaseId: purchase.id,
      number: purchase.number,
      date: purchase.date,
      lines: purchase.lines.map((l) => ({
        lineId: l.id,
        productId: l.productId,
        baseQuantity: l.baseQuantity.toString(),
        unitCostCents: l.unitCostCents.toString(),
        addsStock: l.addsStock,
      })),
    });
    return purchase;
  });
}

async function lockPurchase(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Purchase" WHERE id = ${id} FOR UPDATE`;
  const p = await tx.purchase.findUnique({ where: { id }, include: { payments: true } });
  if (!p) throw new DomainError("La compra no existe");
  return p;
}

/** Anula la compra (revierte el stock vía evento). Si tiene pagos vigentes, hay que anularlos primero. */
export async function cancelPurchase(id: string, reason: string, userId: string) {
  const text = reasonInput.parse(reason);
  return runInTransaction(async (tx, publish) => {
    const p = await lockPurchase(tx, id);
    if (p.status === "CANCELLED") throw new DomainError("La compra ya está anulada.");
    if (p.payments.some((x) => !x.voidedAt)) {
      throw new DomainError("Tiene pagos registrados: anula primero los pagos y después la compra.");
    }
    await tx.purchase.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: text, cancelledById: userId },
    });
    await publish("purchase.cancelled", { purchaseId: id, number: p.number, reason: text });
  });
}

// ---------------------------------------------------------------------------
// Pagos / abonos
// ---------------------------------------------------------------------------

/** Abono a una compra: no puede superar el saldo. */
export async function addSupplierPayment(purchaseId: string, input: SupplierPaymentInput, userId: string) {
  const data = supplierPaymentInput.parse(input);
  return runInTransaction(async (tx, publish) => {
    const p = await lockPurchase(tx, purchaseId);
    if (p.status === "CANCELLED") throw new DomainError("La compra está anulada.");
    const { balanceCents } = purchaseBalance(p.totalCents, p.payments);
    if (balanceCents <= 0) throw new DomainError("La compra ya está pagada.");
    if (data.amountCents > balanceCents) {
      throw new DomainError("El abono supera el saldo pendiente.", { amountCents: "Mayor al saldo" });
    }
    const payment = await tx.supplierPayment.create({ data: { purchaseId, ...data, createdById: userId } });
    await publish("supplier_payment.changed", { purchaseId, paymentId: payment.id, voided: false });
    return payment;
  });
}

/** Anular un pago: queda registrado con motivo y el saldo vuelve a subir. */
export async function voidSupplierPayment(paymentId: string, reason: string, userId: string) {
  const text = reasonInput.parse(reason);
  return runInTransaction(async (tx, publish) => {
    const payment = await tx.supplierPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new DomainError("El pago no existe");
    await lockPurchase(tx, payment.purchaseId);
    if (payment.voidedAt) throw new DomainError("El pago ya está anulado.");
    await tx.supplierPayment.update({
      where: { id: paymentId },
      data: { voidedAt: new Date(), voidReason: text, voidedById: userId },
    });
    await publish("supplier_payment.changed", { purchaseId: payment.purchaseId, paymentId, voided: true });
  });
}

/**
 * Pagos a proveedores de un día, por método (lo usa el cierre de caja: el efectivo resta del esperado).
 * Incluye el detalle para mostrar "Pagos a proveedores" en el cierre.
 */
export async function supplierPaymentsForDay(date: string) {
  const rows = await db.supplierPayment.findMany({
    where: { date, voidedAt: null, purchase: { status: "ACTIVE" } },
    include: { purchase: { select: { number: true, supplier: { select: { name: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const byMethod: Record<SupplierPaymentMethod, number> = { CASH: 0, TRANSFER: 0, CARD: 0 };
  for (const r of rows) byMethod[r.method] += r.amountCents;
  return {
    byMethod,
    totalCents: rows.reduce((s, r) => s + r.amountCents, 0),
    payments: rows.map((r) => ({
      purchaseNumber: r.purchase.number,
      supplier: r.purchase.supplier?.name ?? null,
      method: r.method,
      amountCents: r.amountCents,
    })),
  };
}

export type SupplierPaymentsForDay = Awaited<ReturnType<typeof supplierPaymentsForDay>>;
