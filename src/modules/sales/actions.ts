"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { type ActionResult, toActionResult } from "@/core/actions/result";
import { requirePermission } from "@/core/auth/server";
import { can } from "@/core/auth/permissions";
import { authorizeAction } from "@/core/auth/service";
import type { SessionUser } from "@/core/auth/session";
import { DomainError } from "@/core/errors";
import { parseMoney } from "@/core/money";
import { setSetting } from "@/core/settings";
import { businessDate } from "@/core/time";

import type { DraftLineInput, ItemUpdateInput, OrderHeaderInput } from "./schemas";
import type { DiscountInput, PaymentEntry } from "./domain/checkout";
import * as checkout from "./services/checkout";
import * as history from "./services/history";
import * as orders from "./services/orders";
import * as voids from "./services/voids";
import { peyaMarkupSetting } from "./settings";

export async function savePeyaMarkupAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  await requirePermission("settings.manage");
  return toActionResult(async () => {
    const percent = z.coerce
      .number({ message: "Ingresa un número" })
      .min(0, "No puede ser negativo")
      .max(300, "Máximo 300 %")
      .parse(String(fd.get("percent") ?? "").replace(",", "."));
    await setSetting(peyaMarkupSetting, percent);
    revalidatePath("/ajustes");
    return `Recargo PEYA guardado: ${percent} %`;
  });
}

// ---------------------------------------------------------------------------
// Órdenes (pantalla de venta)
// ---------------------------------------------------------------------------


function refreshSales() {
  revalidatePath("/pos");
  revalidatePath("/ordenes");
}

/** Si se pidió, envía a cocina lo pendiente. Devuelve el texto a agregar al mensaje. */
async function maybeSend(orderId: string, send: boolean): Promise<string> {
  if (!send) return "";
  if ((await orders.countUnsentKitchenItems(orderId)) === 0) return " (no había platos para cocina)";
  await orders.sendToKitchen(orderId);
  return " y enviada a cocina";
}

export async function createOrderAction(
  header: OrderHeaderInput,
  lines: DraftLineInput[],
  options: { send: boolean } = { send: false },
): Promise<ActionResult & { orderId?: string; number?: number }> {
  const session = await requirePermission("sales.pos");
  const out: { order?: { id: string; number: number } } = {};
  const result = await toActionResult(async () => {
    out.order = await orders.createOrder(header, lines, session.userId);
    const sent = await maybeSend(out.order.id, options.send);
    refreshSales();
    return `Orden #${out.order.number} guardada${sent}`;
  });
  return out.order ? { ...result, orderId: out.order.id, number: out.order.number } : result;
}

export async function saveOrderChangesAction(
  orderId: string,
  info: Pick<OrderHeaderInput, "serviceType" | "tableNumber" | "customerName">,
  lines: DraftLineInput[],
  options: { send: boolean } = { send: false },
): Promise<ActionResult> {
  await requirePermission("sales.pos");
  return toActionResult(async () => {
    await orders.updateOrderInfo(orderId, info);
    if (lines.length > 0) await orders.addItems(orderId, lines);
    const sent = await maybeSend(orderId, options.send);
    refreshSales();
    return (lines.length > 0 ? "Ítems agregados" : "Orden actualizada") + sent;
  });
}

export async function sendToKitchenAction(orderId: string): Promise<ActionResult> {
  await requirePermission("sales.pos");
  return toActionResult(async () => {
    const { sentCount } = await orders.sendToKitchen(orderId);
    refreshSales();
    return `Enviado a cocina (${sentCount})`;
  });
}

export async function updateItemAction(orderId: string, itemId: string, input: ItemUpdateInput): Promise<ActionResult> {
  await requirePermission("sales.pos");
  return toActionResult(async () => {
    await orders.updateItem(orderId, itemId, input);
    refreshSales();
  });
}

export async function removeItemAction(orderId: string, itemId: string): Promise<ActionResult> {
  await requirePermission("sales.pos");
  return toActionResult(async () => {
    await orders.removeItem(orderId, itemId);
    refreshSales();
  });
}

// ---------------------------------------------------------------------------
// Anulaciones: quien tiene "Autorizar anulaciones" anula directo; el resto necesita el usuario y PIN de
// alguien con ese permiso.
// ---------------------------------------------------------------------------

export type VoidInput = { reason: string; authUsername?: string; authPin?: string };

async function voidActor(session: SessionUser, input: VoidInput): Promise<voids.VoidActor> {
  if (can(session, "sales.void.authorize")) return { userId: session.userId, authorizedById: session.userId };
  const by = await authorizeAction({ username: input.authUsername ?? "", pin: input.authPin ?? "" }, "sales.void.authorize");
  return { userId: session.userId, authorizedById: by.userId };
}

function refreshAfterVoid(orderId: string) {
  refreshSales();
  revalidatePath("/historial");
  revalidatePath(`/historial/${orderId}`);
  revalidatePath("/cierre");
  revalidatePath("/cuentas-por-cobrar");
}

export async function voidItemAction(orderId: string, itemId: string, input: VoidInput): Promise<ActionResult> {
  const session = await requirePermission(["sales.void", "sales.void.authorize"]);
  return toActionResult(async () => {
    const actor = await voidActor(session, input);
    await voids.voidItem(orderId, itemId, input.reason, actor);
    refreshAfterVoid(orderId);
    return "Ítem anulado";
  });
}

export async function cancelOrderAction(orderId: string, input: VoidInput): Promise<ActionResult> {
  const session = await requirePermission(["sales.void", "sales.void.authorize"]);
  return toActionResult(async () => {
    const actor = await voidActor(session, input);
    const r = await voids.cancelOrder(orderId, input.reason, actor);
    refreshAfterVoid(orderId);
    return `Orden #${r.number} anulada${r.wasPaid ? " (pago devuelto)" : ""}`;
  });
}

// ---------------------------------------------------------------------------
// Cobro y cuentas por cobrar
// ---------------------------------------------------------------------------

/** Cobra la orden y lleva a la pantalla de "cobrada" (vuelto + ticket). Si falla, devuelve el error. */
export async function payOrderAction(
  orderId: string,
  input: { discount: DiscountInput; entries: PaymentEntry[]; customerName?: string | null },
): Promise<ActionResult> {
  const session = await requirePermission("sales.charge");
  const result = await toActionResult(async () => {
    if (input.discount && input.discount.value > 0 && !can(session, "sales.discount")) {
      throw new DomainError("Tu rol no permite dar descuentos.");
    }
    await checkout.payOrder(orderId, input, session.userId);
    refreshSales();
    revalidatePath("/cuentas-por-cobrar");
  });
  if (result.ok) redirect(`/pos?cobrada=${orderId}`);
  return result;
}

export async function collectCreditAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("sales.credit");
  return toActionResult(async () => {
    const amount = String(fd.get("amount") ?? "");
    const r = await checkout.collectCredit(
      String(fd.get("paymentId") ?? ""),
      {
        method: String(fd.get("method") ?? "CASH") as PaymentEntry["method"],
        amountCents: parseMoneySafe(amount),
      },
      session.userId,
    );
    revalidatePath("/cuentas-por-cobrar");
    return r.settled ? "Cuenta saldada ✔" : "Pago registrado";
  });
}

/** Campo opcional: vacío = no se revisó ese medio. */
function optionalMoney(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  return text ? parseMoneySafe(text) : null;
}

function parseMoneySafe(text: string): number {
  try {
    return parseMoney(text);
  } catch {
    throw new DomainError("Monto inválido");
  }
}

// ---------------------------------------------------------------------------
// Apertura de caja
// ---------------------------------------------------------------------------

export async function openCashAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("cash.close");
  return toActionResult(async () => {
    const amount = String(fd.get("amount") ?? "").trim();
    if (!amount) throw new DomainError("Ingresa el efectivo inicial (puede ser 0).");
    await history.openCash(
      businessDate(),
      { openingCashCents: parseMoneySafe(amount), notes: String(fd.get("notes") ?? "") },
      session.userId,
    );
    revalidatePath("/pos");
    revalidatePath("/cierre");
    return "Caja abierta";
  });
}

// ---------------------------------------------------------------------------
// Cierre de caja
// ---------------------------------------------------------------------------

export async function saveClosingAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("cash.close");
  return toActionResult(async () => {
    const date = String(fd.get("fecha") ?? "");
    await history.saveClosing(
      date,
      {
        countedCashCents: parseMoneySafe(String(fd.get("counted") ?? "")),
        countedQrCents: optionalMoney(fd.get("countedQr")),
        countedCardCents: optionalMoney(fd.get("countedCard")),
        notes: String(fd.get("notes") ?? ""),
      },
      session.userId,
    );
    revalidatePath("/cierre");
    return "Cierre guardado";
  });
}
