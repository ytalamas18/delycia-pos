"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { type ActionResult, toActionResult } from "@/core/actions/result";
import { requirePermission } from "@/core/auth/server";

import type { PurchaseInput } from "./schemas";
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
