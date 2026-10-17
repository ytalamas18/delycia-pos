import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, disconnectDb } from "@/core/db/client";
import { eventBus } from "@/core/db/transaction";
import { kitchenModule, listActiveTickets } from "@/modules/kitchen";

import * as tickets from "@/modules/kitchen/services/tickets";
import * as orders from "@/modules/sales/services/orders";

import { seed } from "../../prisma/seed-data";
import { resetDatabase } from "../support/db";

const line = (productId: string, extra: Record<string, unknown> = {}) => ({
  productId,
  quantity: 1,
  modifierIds: [] as string[],
  note: "",
  serviceType: "DINE_IN" as const,
  ...extra,
});

async function fixtures() {
  await seed(db);
  const user = await db.user.findUniqueOrThrow({ where: { name: "Cocina" } });
  const caja = await db.user.findUniqueOrThrow({ where: { name: "Caja" } });
  const plato = await db.product.findFirstOrThrow({ where: { name: "Majadito (ejemplo)" }, include: { modifiers: true } });
  const salchi = await db.product.findFirstOrThrow({ where: { name: "Salchipapa de pollo (ejemplo)" } });
  const gaseosa = await db.product.findFirstOrThrow({ where: { name: "Gaseosa 500 ml (ejemplo)" } });
  return { user, caja, plato, salchi, gaseosa };
}

afterAll(async () => {
  eventBus.reset();
  await disconnectDb();
});

describe("enviar a cocina", () => {
  beforeEach(async () => {
    eventBus.reset();
    kitchenModule.registerSubscribers?.();
    await resetDatabase();
  });
  it("manda solo lo que va a cocina (la gaseosa no) y crea la comanda con mesa y notas", async () => {
    const { caja, plato, gaseosa } = await fixtures();
    const sinCebolla = plato.modifiers.find((m) => m.name === "Sin cebolla")!;
    const order = await orders.createOrder(
      { channel: "LOCAL", serviceType: "DINE_IN", tableNumber: "4", customerName: "Don Pedro" },
      [line(plato.id, { quantity: 2, modifierIds: [sinCebolla.id], note: "bien cocido" }), line(gaseosa.id)],
      caja.id,
    );
    await orders.sendToKitchen(order.id);

    const [ticket] = await listActiveTickets();
    expect(ticket).toMatchObject({ orderNumber: 1, sequence: 1, label: "Mesa 4 · Don Pedro", status: "PENDING" });
    expect(ticket.items).toHaveLength(1);
    expect(ticket.items[0]).toMatchObject({ name: "Majadito (ejemplo)", quantity: 2, note: "bien cocido", modifiers: ["Sin cebolla"] });
  });

  it("al agregar un plato a la mesa, solo ese plato va en una comanda ADICIONAL", async () => {
    const { caja, plato, salchi } = await fixtures();
    const order = await orders.createOrder(
      { channel: "LOCAL", serviceType: "DINE_IN", tableNumber: "4" },
      [line(plato.id)],
      caja.id,
    );
    await orders.sendToKitchen(order.id);
    await orders.addItems(order.id, [line(salchi.id, { serviceType: "TAKEAWAY" })]);
    await orders.sendToKitchen(order.id);

    const all = await listActiveTickets();
    expect(all.map((t) => t.sequence)).toEqual([1, 2]);
    expect(all[1].items.map((i) => i.name)).toEqual(["Salchipapa de pollo (ejemplo)"]);
    expect(all[1].items[0].serviceType).toBe("TAKEAWAY");
  });

  it("enviar dos veces sin nada nuevo no crea comandas vacías", async () => {
    const { caja, plato, gaseosa } = await fixtures();
    const order = await orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(plato.id)], caja.id);
    await orders.sendToKitchen(order.id);
    await expect(orders.sendToKitchen(order.id)).rejects.toThrow("No hay platos nuevos");

    const soloBebida = await orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(gaseosa.id)], caja.id);
    await expect(orders.sendToKitchen(soloBebida.id)).rejects.toThrow("No hay platos nuevos");
    expect(await db.kitchenTicket.count()).toBe(1);
  });

  it("si cocina falla al crear la comanda, los ítems NO quedan marcados como enviados", async () => {
    const { caja, plato } = await fixtures();
    const order = await orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(plato.id)], caja.id);
    eventBus.onTransaction("order.sent_to_kitchen", () => {
      throw new Error("cocina caída");
    });
    await expect(orders.sendToKitchen(order.id)).rejects.toThrow("cocina caída");
    const item = await db.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    expect(item.sentToKitchenAt).toBeNull();
    expect(await db.kitchenTicket.count()).toBe(0);
  });
});

describe("estados de la comanda", () => {
  beforeEach(async () => {
    eventBus.reset();
    kitchenModule.registerSubscribers?.();
    await resetDatabase();
  });

  async function ticketWithTwoItems() {
    const { user, caja, plato, salchi } = await fixtures();
    const order = await orders.createOrder(
      { channel: "PEYA", serviceType: "TAKEAWAY", customerName: "Ana" },
      [line(plato.id), line(salchi.id)],
      caja.id,
    );
    await orders.sendToKitchen(order.id);
    const [ticket] = await listActiveTickets();
    return { ticket, user };
  }

  it("avanza con un toque, guarda la hora de cada estado y avisa cuando está lista", async () => {
    const { ticket, user } = await ticketWithTwoItems();
    expect(ticket.label).toBe("PEYA · Ana");

    expect(await tickets.advanceTicket(ticket.id, user.id)).toBe("IN_PROGRESS");
    expect(await tickets.advanceTicket(ticket.id, user.id)).toBe("READY");
    const ready = await tickets.getTicket(ticket.id);
    expect(ready?.startedAt).not.toBeNull();
    expect(ready?.readyAt).not.toBeNull();
    expect(ready?.items.every((i) => i.readyAt)).toBe(true);

    const readyEvents = await db.domainEvent.findMany({ where: { type: "ticket.ready" } });
    expect(readyEvents).toHaveLength(1);

    expect(await tickets.advanceTicket(ticket.id, user.id)).toBe("DELIVERED");
    await expect(tickets.advanceTicket(ticket.id, user.id)).rejects.toThrow("no se puede avanzar");
    expect(await db.ticketStatusLog.count({ where: { ticketId: ticket.id } })).toBe(4);
  });

  it("deshacer vuelve un paso y borra la hora del estado deshecho", async () => {
    const { ticket, user } = await ticketWithTwoItems();
    await tickets.advanceTicket(ticket.id, user.id);
    await tickets.advanceTicket(ticket.id, user.id);
    await tickets.advanceTicket(ticket.id, user.id); // entregada por error
    expect(await tickets.undoTicket(ticket.id, user.id)).toBe("READY");
    const t = await tickets.getTicket(ticket.id);
    expect(t?.deliveredAt).toBeNull();
    expect(t?.readyAt).not.toBeNull();
  });

  it("marcar ítems uno por uno: el primero la pone en preparación y el último la deja lista", async () => {
    const { ticket, user } = await ticketWithTwoItems();
    await tickets.toggleItemReady(ticket.items[0].id, user.id);
    expect((await tickets.getTicket(ticket.id))?.status).toBe("IN_PROGRESS");
    await tickets.toggleItemReady(ticket.items[1].id, user.id);
    expect((await tickets.getTicket(ticket.id))?.status).toBe("READY");
  });
});
