import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { authorizeWithAdminPin } from "@/core/auth/service";
import { db, disconnectDb } from "@/core/db/client";
import { eventBus } from "@/core/db/transaction";
import { businessDate } from "@/core/time";
import { getKdsSnapshot, kitchenModule } from "@/modules/kitchen";
import { salesModule } from "@/modules/sales";

import * as tickets from "@/modules/kitchen/services/tickets";
import * as checkout from "@/modules/sales/services/checkout";
import * as history from "@/modules/sales/services/history";
import * as orders from "@/modules/sales/services/orders";
import * as voids from "@/modules/sales/services/voids";

import { seed } from "../../prisma/seed-data";
import { resetDatabase } from "../support/db";
import { seedTestCatalog } from "../support/test-catalog";

const ADMIN_PIN = "4826";

const line = (productId: string, extra: Record<string, unknown> = {}) => ({
  productId,
  quantity: 1,
  modifierIds: [] as string[],
  note: "",
  serviceType: "DINE_IN" as const,
  ...extra,
});

async function fixtures() {
  await seed(db, { Admin: ADMIN_PIN, Caja: "5937", Cocina: "6048" }, { menu: false });
  await seedTestCatalog(db);
  const caja = await db.user.findUniqueOrThrow({ where: { name: "Caja" } });
  const admin = await db.user.findUniqueOrThrow({ where: { name: "Admin" } });
  const plato = await db.product.findFirstOrThrow({ where: { name: "Majadito (ejemplo)" } }); // 38 Bs
  const salchi = await db.product.findFirstOrThrow({ where: { name: "Salchipapa de pollo (ejemplo)" } }); // 30 Bs
  const gaseosa = await db.product.findFirstOrThrow({ where: { name: "Gaseosa 500 ml (ejemplo)" } }); // 10 Bs
  const actor = { userId: caja.id, authorizedById: admin.id };
  return { caja, admin, plato, salchi, gaseosa, actor };
}

const dineIn = { channel: "LOCAL" as const, serviceType: "DINE_IN" as const, tableNumber: "3" };

beforeEach(async () => {
  eventBus.reset();
  kitchenModule.registerSubscribers?.();
  salesModule.registerSubscribers?.();
  await resetDatabase();
});
afterAll(async () => {
  eventBus.reset();
  await disconnectDb();
});

describe("anular un ítem", () => {
  it("queda VOIDED con motivo, usuario y autorizador; el total se recalcula", async () => {
    const { caja, admin, plato, gaseosa, actor } = await fixtures();
    const order = await orders.createOrder(dineIn, [line(plato.id), line(gaseosa.id)], caja.id);
    const soda = (await orders.getOrder(order.id))!.items.find((i) => i.productId === gaseosa.id)!;

    await voids.voidItem(order.id, soda.id, "  Error al cargar ", actor);

    const after = await orders.getOrder(order.id);
    expect(after).toMatchObject({ status: "OPEN", subtotalCents: 3800, totalCents: 3800 });
    expect(after!.items.find((i) => i.id === soda.id)).toMatchObject({
      status: "VOIDED",
      voidReason: "Error al cargar",
      voidedById: caja.id,
      voidAuthorizedById: admin.id,
    });
    expect(after!.items).toHaveLength(2); // no se borra
  });

  it("exige motivo y no se puede en una orden ya cobrada", async () => {
    const { caja, plato, actor } = await fixtures();
    const order = await orders.createOrder(dineIn, [line(plato.id)], caja.id);
    const item = (await orders.getOrder(order.id))!.items[0];
    await expect(voids.voidItem(order.id, item.id, " ", actor)).rejects.toThrow(/motivo/);

    await checkout.payOrder(order.id, { discount: null, entries: [{ method: "QR", amountCents: 3800 }] }, caja.id);
    await expect(voids.voidItem(order.id, item.id, "Se cobró mal", actor)).rejects.toThrow(/orden completa/);
  });

  it("en cocina: el ítem queda ANULADO y la comanda muestra el aviso hasta 'Entendido'", async () => {
    const { caja, plato, salchi, actor } = await fixtures();
    const order = await orders.createOrder(dineIn, [line(plato.id), line(salchi.id)], caja.id);
    await orders.sendToKitchen(order.id);
    const salchiItem = (await orders.getOrder(order.id))!.items.find((i) => i.productId === salchi.id)!;

    await voids.voidItem(order.id, salchiItem.id, "Cliente se arrepintió", actor);

    let kds = await getKdsSnapshot();
    expect(kds.active).toHaveLength(1);
    expect(kds.active[0]).toMatchObject({ status: "PENDING", voidAlert: true });
    expect(kds.active[0].items.find((i) => i.name.startsWith("Salchipapa"))).toMatchObject({
      voided: true,
      voidReason: "Cliente se arrepintió",
    });

    await tickets.acknowledgeVoid(kds.active[0].id);
    kds = await getKdsSnapshot();
    expect(kds.active[0].voidAlert).toBe(false);
  });

  it("si se anula todo lo de una comanda, la comanda pasa a ANULADA y queda a la vista hasta 'Entendido'", async () => {
    const { caja, plato, actor } = await fixtures();
    const order = await orders.createOrder(dineIn, [line(plato.id)], caja.id);
    await orders.sendToKitchen(order.id);
    const item = (await orders.getOrder(order.id))!.items[0];

    await voids.voidItem(order.id, item.id, "Error al cargar", actor);

    let kds = await getKdsSnapshot();
    expect(kds.active).toEqual([expect.objectContaining({ status: "CANCELLED", voidAlert: true })]);
    await tickets.acknowledgeVoid(kds.active[0].id);
    kds = await getKdsSnapshot();
    expect(kds.active).toHaveLength(0);
    expect(kds.recent).toEqual([expect.objectContaining({ status: "CANCELLED", voidAlert: false })]);
  });
});

describe("anular la orden completa", () => {
  it("por pagar en cocina: orden ANULADA con motivo y sus comandas ANULADAS", async () => {
    const { caja, admin, plato, actor } = await fixtures();
    const order = await orders.createOrder(dineIn, [line(plato.id)], caja.id);
    await orders.sendToKitchen(order.id);

    await voids.cancelOrder(order.id, "Cliente se fue", actor);

    const after = await orders.getOrder(order.id);
    expect(after).toMatchObject({
      status: "CANCELLED",
      cancelReason: "Cliente se fue",
      cancelledById: caja.id,
      cancelAuthorizedById: admin.id,
      totalCents: 3800, // se conserva para saber cuánto se anuló
    });
    expect(after!.cancelledAt).toBeInstanceOf(Date);
    const kds = await getKdsSnapshot();
    expect(kds.active).toEqual([expect.objectContaining({ status: "CANCELLED", voidAlert: true })]);
    expect(kds.active[0].items.every((i) => i.voided)).toBe(true);
    await expect(voids.cancelOrder(order.id, "otra vez", actor)).rejects.toThrow(/ya está anulada/);
  });

  it("cobrada: pagos devueltos y el cierre no la suma (ni en efectivo esperado)", async () => {
    const { caja, plato, gaseosa, actor } = await fixtures();
    const keep = await orders.createOrder(dineIn, [line(gaseosa.id)], caja.id);
    await checkout.payOrder(keep.id, { discount: null, entries: [{ method: "CASH", amountCents: 1000 }] }, caja.id);
    const order = await orders.createOrder(dineIn, [line(plato.id), line(gaseosa.id)], caja.id);
    await checkout.payOrder(order.id, { discount: null, entries: [{ method: "CASH", amountCents: 4800 }] }, caja.id);

    await voids.cancelOrder(order.id, "Se cobró mal", actor);

    const after = await orders.getOrder(order.id);
    expect(after!.payments.every((p) => p.refundedAt)).toBe(true);
    const { summary } = await history.getDailyClosing(businessDate());
    expect(summary).toMatchObject({
      paidCount: 1,
      netCents: 1000,
      cancelledCount: 1,
      cancelledCents: 4800,
      refundedCents: 4800,
    });
    expect(summary.moneyInByMethod.CASH).toBe(1000);
    expect(summary.products).toEqual([expect.objectContaining({ name: "Gaseosa 500 ml (ejemplo)", quantity: 1 })]);
  });

  it("los ítems anulados no suman en el cierre pero se informan", async () => {
    const { caja, plato, gaseosa, actor } = await fixtures();
    const order = await orders.createOrder(dineIn, [line(plato.id), line(gaseosa.id, { quantity: 2 })], caja.id);
    const soda = (await orders.getOrder(order.id))!.items.find((i) => i.productId === gaseosa.id)!;
    await voids.voidItem(order.id, soda.id, "Error al cargar", actor);
    await checkout.payOrder(order.id, { discount: null, entries: [{ method: "CASH", amountCents: 3800 }] }, caja.id);

    const { summary } = await history.getDailyClosing(businessDate());
    expect(summary).toMatchObject({ netCents: 3800, voidedItemsCount: 2, voidedItemsCents: 2000 });
  });

  it("cobrada de otro día no se puede anular; fiado con abonos tampoco", async () => {
    const { caja, plato, actor } = await fixtures();
    const old = await orders.createOrder(dineIn, [line(plato.id)], caja.id);
    await checkout.payOrder(old.id, { discount: null, entries: [{ method: "QR", amountCents: 3800 }] }, caja.id);
    await expect(voids.cancelOrder(old.id, "Se cobró mal", actor, "2099-01-01")).rejects.toThrow(/mismo día/);

    const credit = await orders.createOrder({ ...dineIn, customerName: "Don Pedro" }, [line(plato.id)], caja.id);
    await checkout.payOrder(credit.id, { discount: null, entries: [{ method: "CREDIT", amountCents: 3800 }] }, caja.id);
    const payment = (await orders.getOrder(credit.id))!.payments[0];
    await checkout.collectCredit(payment.id, { method: "CASH", amountCents: 1000 }, caja.id);
    await expect(voids.cancelOrder(credit.id, "Error", actor)).rejects.toThrow(/abonos/);
  });

  it("fiado sin abonos: se anula y desaparece de cuentas por cobrar", async () => {
    const { caja, plato, actor } = await fixtures();
    const credit = await orders.createOrder({ ...dineIn, customerName: "Ana" }, [line(plato.id)], caja.id);
    await checkout.payOrder(credit.id, { discount: null, entries: [{ method: "CREDIT", amountCents: 3800 }] }, caja.id);
    await voids.cancelOrder(credit.id, "Error al cargar", actor);
    expect(await checkout.listOpenReceivables()).toEqual([]);
  });
});

describe("PIN de Admin para anular desde Caja", () => {
  it("acepta el PIN del Admin y rechaza otro (con bloqueo por intentos)", async () => {
    const { admin } = await fixtures();
    await expect(authorizeWithAdminPin(ADMIN_PIN)).resolves.toMatchObject({ userId: admin.id, role: "ADMIN" });
    await expect(authorizeWithAdminPin("5937")).rejects.toThrow(/incorrecto/); // PIN de Caja: no sirve
    for (let i = 0; i < 3; i++) await expect(authorizeWithAdminPin("0000")).rejects.toThrow(/incorrecto/);
    await expect(authorizeWithAdminPin("0001")).rejects.toThrow(/bloqueado/);
  });
});
