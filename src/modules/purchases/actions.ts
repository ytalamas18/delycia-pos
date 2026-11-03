"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { type ActionResult, toActionResult } from "@/core/actions/result";
import { requirePermission } from "@/core/auth/server";

import type { PurchaseInput } from "./schemas";
import { formatMoney } from "@/core/money";
import { businessDate } from "@/core/time";

import { getPurchaseFormData } from "./services/form-data";
import * as purchases from "./services/purchases";
import * as suppliers from "./services/suppliers";

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");

function refresh() {
  revalidatePath("/compras", "layout");
  revalidatePath("/cierre");
}

// --- Proveedores ---

function supplierFromForm(fd: FormData) {
  return {
    name: text(fd, "name"),
    phone: text(fd, "phone"),
    document: text(fd, "document"),
    note: text(fd, "note"),
    // Al editar llega "off" (oculto) y, si está marcado, también "on".
    active: fd.getAll("active").length === 0 || fd.getAll("active").includes("on"),
  };
}

export async function saveSupplierAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePermission("purchases.manage");
  const id = text(fd, "id");
  return toActionResult(
    async () => {
      if (id) await suppliers.updateSupplier(id, supplierFromForm(fd));
      else await suppliers.createSupplier(supplierFromForm(fd));
      refresh();
      return id ? "Proveedor guardado" : "Proveedor creado";
    },
    { duplicate: "Ya existe un proveedor con ese nombre." },
  );
}

// --- Compras ---

export async function createPurchaseAction(input: PurchaseInput): Promise<ActionResult> {
  const session = await requirePermission("purchases.manage");
  let id: string | null = null;
  const result = await toActionResult(async () => {
    id = (await purchases.createPurchase(input, session.userId)).id;
    refresh();
  });
  if (id) redirect(`/compras/${id}?nueva=1`);
  return result;
}

export async function cancelPurchaseAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("purchases.manage");
  return toActionResult(async () => {
    await purchases.cancelPurchase(text(fd, "id"), text(fd, "reason"), session.userId);
    refresh();
    return "Compra anulada";
  });
}

export async function addSupplierPaymentAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("purchases.manage");
  return toActionResult(async () => {
    await purchases.addSupplierPayment(
      text(fd, "purchaseId"),
      {
        date: text(fd, "date"),
        amountCents: text(fd, "amount"),
        method: text(fd, "method") as "CASH",
        account: text(fd, "account") as "CASH",
        reference: text(fd, "reference"),
        note: text(fd, "note"),
      },
      session.userId,
    );
    refresh();
    return "Pago registrado";
  });
}

export async function voidSupplierPaymentAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("purchases.manage");
  return toActionResult(async () => {
    await purchases.voidSupplierPayment(text(fd, "paymentId"), text(fd, "reason"), session.userId);
    refresh();
    return "Pago anulado";
  });
}

// --- Compra en efectivo desde la caja (barra superior) ---

export async function createCashPurchaseAction(input: purchases.CashPurchaseInput): Promise<ActionResult> {
  const session = await requirePermission(["purchases.cash", "purchases.manage"]);
  return toActionResult(async () => {
    const p = await purchases.createCashPurchase(input, session.userId);
    refresh();
    revalidatePath("/caja-bancos");
    return `Compra #${p.number} registrada: ${formatMoney(p.totalCents)} salen de la caja`;
  });
}

export async function voidCashPurchaseAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission(["purchases.cash", "purchases.manage"]);
  return toActionResult(async () => {
    await purchases.voidCashPurchase(text(fd, "id"), text(fd, "reason"), session.userId);
    refresh();
    revalidatePath("/caja-bancos");
    return "Compra anulada: vuelve a la caja";
  });
}

/** Datos para la ventana "Compra en efectivo": ítems, proveedores y compras de hoy desde la caja. */
export async function cashPurchaseDataAction() {
  await requirePermission(["purchases.cash", "purchases.manage"]);
  const [form, today] = await Promise.all([getPurchaseFormData(), purchases.listCashPurchasesForDay(businessDate())]);
  return { ...form, today };
}
