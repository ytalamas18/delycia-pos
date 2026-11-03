import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, disconnectDb } from "@/core/db/client";
import { eventBus } from "@/core/db/transaction";
import { getKdsSnapshot, kitchenModule, listActiveTickets } from "@/modules/kitchen";

import * as tickets from "@/modules/kitchen/services/tickets";
import * as orders from "@/modules/sales/services/orders";

import { seed } from "../../prisma/seed-data";
import { resetDatabase } from "../support/db";
import { seedTestCatalog } from "../support/test-catalog";

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
  await seedTestCatalog(db);
  const user = await db.user.findUniqueOrThrow({ where: { username: "cocina" } });
  const caja = await db.user.findUniqueOrThrow({ where: { username: "caja" } });
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

describe("envío automático (Guardar / Cobrar envían a cocina)", () => {
  beforeEach(async () => {
    eventBus.reset();
    kitchenModule.registerSubscribers?.();
    await resetDatabase();
  });

  it("crear la orden desde el POS la guarda y la envía en la misma transacción (la gaseosa no va)", async () => {
    const { caja, plato, gaseosa } = await fixtures();
    const order = await orders.createOrder(
      { channel: "LOCAL", serviceType: "DINE_IN", tableNumber: "2" },
      [line(plato.id), line(gaseosa.id)],
      caja.id,
      { sendToKitchen: true },
    );
    expect(order.sentCount).toBe(1);
    const [ticket] = await listActiveTickets();
    expect(ticket.items.map((i) => i.name)).toEqual(["Majadito (ejemplo)"]);
    const bebida = await db.orderItem.findFirstOrThrow({ where: { orderId: order.id, productId: gaseosa.id } });
    expect(bebida.sentToKitchenAt).toBeNull();
  });

  it("solo bebidas: se guarda sin crear comanda", async () => {
    const { caja, gaseosa } = await fixtures();
    const order = await orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(gaseosa.id)], caja.id, {
      sendToKitchen: true,
    });
    expect(order.sentCount).toBe(0);
    expect(await db.kitchenTicket.count()).toBe(0);
  });

  it("guardar una orden existente envía lo agregado como adicional y lo que quedó sin enviar", async () => {
    const { caja, plato, salchi } = await fixtures();
    // Orden "antigua" guardada sin enviar.
    const order = await orders.createOrder({ channel: "LOCAL", serviceType: "DINE_IN", tableNumber: "5" }, [line(plato.id)], caja.id);
    const first = await orders.saveOrderAndSend(order.id, { serviceType: "DINE_IN", tableNumber: "5", customerName: "Ana" }, []);
    expect(first.sentCount).toBe(1);
    const second = await orders.saveOrderAndSend(order.id, { serviceType: "DINE_IN", tableNumber: "5", customerName: "Ana" }, [
      line(salchi.id),
    ]);
    expect(second.sentCount).toBe(1);
    const all = await listActiveTickets();
    expect(all.map((t) => t.sequence)).toEqual([1, 2]);
    expect(all[1].items.map((i) => i.name)).toEqual(["Salchipapa de pollo (ejemplo)"]);
    // Guardar sin nada nuevo no crea comandas vacías.
    expect((await orders.saveOrderAndSend(order.id, { serviceType: "DINE_IN", tableNumber: "5" }, [])).sentCount).toBe(0);
    expect(await db.kitchenTicket.count()).toBe(2);
  });

  it("PEYA se envía al guardar como para llevar", async () => {
    const { caja, plato } = await fixtures();
    await orders.createOrder({ channel: "PEYA", serviceType: "TAKEAWAY", customerName: "Ana" }, [line(plato.id, { serviceType: "TAKEAWAY" })], caja.id, {
      sendToKitchen: true,
    });
    const [ticket] = await listActiveTickets();
    expect(ticket).toMatchObject({ channel: "PEYA", serviceType: "TAKEAWAY", label: "PEYA · Ana" });
  });

  it("si cocina falla, la orden nueva no se guarda a medias", async () => {
    const { caja, plato } = await fixtures();
    eventBus.onTransaction("order.sent_to_kitchen", () => {
      throw new Error("cocina caída");
    });
    await expect(
      orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(plato.id)], caja.id, { sendToKitchen: true }),
    ).rejects.toThrow("cocina caída");
    expect(await db.order.count()).toBe(0);
  });
});

describe("cambiar un plato que está en cocina", () => {
  beforeEach(async () => {
    eventBus.reset();
    kitchenModule.registerSubscribers?.();
    await resetDatabase();
  });

  it("se cambia mientras cocina no lo marque listo: la comanda se actualiza con aviso CAMBIADO hasta 'Entendido'", async () => {
    const { user, caja, plato, salchi } = await fixtures();
    const order = await orders.createOrder(
      { channel: "LOCAL", serviceType: "DINE_IN", tableNumber: "4" },
      [line(plato.id), line(salchi.id)],
      caja.id,
      { sendToKitchen: true },
    );
    const [first, second] = (await orders.getOrder(order.id))!.items;
    await orders.updateItem(order.id, first.id, { quantity: 2, note: "sin sal", serviceType: "DINE_IN" });

    const snap = await getKdsSnapshot();
    const t = snap.active[0];
    expect(t.changeAlert).toBe(true);
    const changed = t.items.find((i) => i.name === "Majadito (ejemplo)")!;
    expect(changed).toMatchObject({ quantity: 2, note: "sin sal", changed: true });
    expect(changed.changeNote).toBe('antes 1× · antes sin nota');
    expect((await orders.getOrder(order.id))!.totalCents).toBeGreaterThan(order.totalCents);

    await tickets.acknowledgeVoid(t.id);
    expect((await getKdsSnapshot()).active[0].changeAlert).toBe(false);

    // Cocina marca listo el segundo: ya no se puede cambiar (y no se cambia nada en ventas).
    const ticketItem = (await tickets.getTicket(t.id))!.items.find((i) => i.orderItemId === second.id)!;
    await tickets.toggleItemReady(ticketItem.id, user.id);
    await expect(orders.updateItem(order.id, second.id, { quantity: 3, note: "", serviceType: "DINE_IN" })).rejects.toThrow("ya marcó este plato como listo");
    expect((await db.orderItem.findUniqueOrThrow({ where: { id: second.id } })).quantity).toBe(1);
  });

  it("las bebidas (no van a cocina) se cambian sin tocar cocina", async () => {
    const { caja, gaseosa } = await fixtures();
    const order = await orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(gaseosa.id)], caja.id, { sendToKitchen: true });
    const [item] = (await orders.getOrder(order.id))!.items;
    await orders.updateItem(order.id, item.id, { quantity: 3, note: "", serviceType: "TAKEAWAY" });
    expect((await db.orderItem.findUniqueOrThrow({ where: { id: item.id } })).quantity).toBe(3);
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

  it("avanza con un toque, guarda la hora de cada estado y 'lista' es el final (= entregada)", async () => {
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

    // Lista = entregada: sale de "En curso" y pasa a "Recientes"
    expect(await listActiveTickets()).toEqual([]);
    expect((await tickets.listRecentTickets()).map((t) => t.id)).toEqual([ticket.id]);
    await expect(tickets.advanceTicket(ticket.id, user.id)).rejects.toThrow("no se puede avanzar");
    expect(await db.ticketStatusLog.count({ where: { ticketId: ticket.id } })).toBe(3);
  });

  it("deshacer 'lista' la devuelve a En curso y borra la hora de lista", async () => {
    const { ticket, user } = await ticketWithTwoItems();
    await tickets.advanceTicket(ticket.id, user.id);
    await tickets.advanceTicket(ticket.id, user.id); // lista por error
    expect(await tickets.undoTicket(ticket.id, user.id)).toBe("IN_PROGRESS");
    const t = await tickets.getTicket(ticket.id);
    expect(t?.readyAt).toBeNull();
    expect(t?.startedAt).not.toBeNull();
    expect((await listActiveTickets()).map((x) => x.id)).toEqual([ticket.id]);
  });

  it("marcar ítems uno por uno: el primero la pone en preparación y el último la deja lista", async () => {
    const { ticket, user } = await ticketWithTwoItems();
    await tickets.toggleItemReady(ticket.items[0].id, user.id);
    expect((await tickets.getTicket(ticket.id))?.status).toBe("IN_PROGRESS");
    await tickets.toggleItemReady(ticket.items[1].id, user.id);
    expect((await tickets.getTicket(ticket.id))?.status).toBe("READY");
  });
});
