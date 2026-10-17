import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, disconnectDb } from "@/core/db/client";
import { eventBus } from "@/core/db/transaction";

import * as orders from "@/modules/sales/services/orders";

import { seed } from "../../prisma/seed-data";
import { resetDatabase } from "../support/db";
import { seedTestCatalog } from "../support/test-catalog";

async function fixtures() {
  await seed(db);
  await seedTestCatalog(db);
  const user = await db.user.findUniqueOrThrow({ where: { name: "Caja" } });
  const plato = await db.product.findFirstOrThrow({ where: { name: "Majadito (ejemplo)" }, include: { modifiers: true } });
  const gaseosa = await db.product.findFirstOrThrow({ where: { name: "Gaseosa 500 ml (ejemplo)" } });
  const extraHuevo = plato.modifiers.find((m) => m.name === "Extra huevo")!;
  const sinCebolla = plato.modifiers.find((m) => m.name === "Sin cebolla")!;
  return { user, plato, gaseosa, extraHuevo, sinCebolla };
}

const line = (productId: string, extra: Record<string, unknown> = {}) => ({
  productId,
  quantity: 1,
  modifierIds: [] as string[],
  note: "",
  serviceType: "DINE_IN" as const,
  ...extra,
});

describe("órdenes", () => {
  beforeEach(async () => {
    eventBus.reset();
    await resetDatabase();
  });
  afterAll(disconnectDb);

  it("crea una orden por pagar con copia de nombre y precio, y calcula el total", async () => {
    const { user, plato, gaseosa, extraHuevo } = await fixtures();
    const order = await orders.createOrder(
      { channel: "LOCAL", serviceType: "DINE_IN", tableNumber: "4", customerName: "Don Pedro" },
      [line(plato.id, { quantity: 2, modifierIds: [extraHuevo.id] }), line(gaseosa.id)],
      user.id,
    );

    const full = await orders.getOrder(order.id);
    expect(full?.status).toBe("OPEN");
    expect(full?.number).toBe(1);
    expect(full?.customerName).toBe("Don Pedro");
    // (38 + 5) × 2 + 10 = 96 Bs
    expect(full?.totalCents).toBe(9600);
    expect(full?.items[0]).toMatchObject({
      productName: "Majadito (ejemplo)",
      listPriceCents: 3800,
      unitPriceCents: 4300,
      modifiers: [{ name: "Extra huevo", priceDeltaCents: 500 }],
      sentToKitchenAt: null,
    });

    // Cambiar el precio en el catálogo NO cambia la orden ya registrada.
    await db.product.update({ where: { id: plato.id }, data: { priceCents: 9900 } });
    expect((await orders.getOrder(order.id))?.items[0].unitPriceCents).toBe(4300);
  });

  it("PEYA aplica el % guardado al abrir la orden, también a los ítems agregados después", async () => {
    const { user, plato, gaseosa } = await fixtures();
    const order = await orders.createOrder({ channel: "PEYA", serviceType: "TAKEAWAY" }, [line(plato.id)], user.id);
    expect(Number(order.channelMarkupPercent)).toBe(40);

    // Aunque luego cambien el %, la orden mantiene el suyo.
    await db.setting.update({ where: { key: "sales.peyaMarkupPercent" }, data: { value: 10 } });
    await orders.addItems(order.id, [line(gaseosa.id, { serviceType: "TAKEAWAY" })]);

    const full = await orders.getOrder(order.id);
    // 38 → 53 y 10 → 14 (con 40 %)
    expect(full?.items.map((i) => i.unitPriceCents)).toEqual([5300, 1400]);
    expect(full?.totalCents).toBe(6700);
  });

  it("numera las órdenes por día", async () => {
    const { user, gaseosa } = await fixtures();
    const a = await orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(gaseosa.id)], user.id);
    const b = await orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(gaseosa.id)], user.id);
    expect([a.number, b.number]).toEqual([1, 2]);
  });

  it("para comer aquí exige mesa o nombre del cliente", async () => {
    const { user, gaseosa } = await fixtures();
    await expect(
      orders.createOrder({ channel: "LOCAL", serviceType: "DINE_IN" }, [line(gaseosa.id)], user.id),
    ).rejects.toThrow("indica la mesa o el nombre");
    const ok = await orders.createOrder(
      { channel: "LOCAL", serviceType: "DINE_IN", customerName: "Ana" },
      [line(gaseosa.id)],
      user.id,
    );
    expect(ok.tableNumber).toBeNull();

    const takeaway = await orders.createOrder(
      { channel: "LOCAL", serviceType: "TAKEAWAY", tableNumber: "5" },
      [line(gaseosa.id)],
      user.id,
    );
    expect(takeaway.tableNumber).toBeNull();
  });

  it("rechaza productos desactivados y modificadores de otro producto", async () => {
    const { user, plato, gaseosa, sinCebolla } = await fixtures();
    await expect(
      orders.createOrder(
        { channel: "LOCAL", serviceType: "TAKEAWAY" },
        [line(gaseosa.id, { modifierIds: [sinCebolla.id] })],
        user.id,
      ),
    ).rejects.toThrow("modificador");
    await db.product.update({ where: { id: plato.id }, data: { active: false } });
    await expect(
      orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(plato.id)], user.id),
    ).rejects.toThrow("ya no está disponible");
  });

  it("edita y quita ítems no enviados; lo enviado a cocina no se toca", async () => {
    const { user, plato, gaseosa } = await fixtures();
    const order = await orders.createOrder(
      { channel: "LOCAL", serviceType: "DINE_IN", tableNumber: "2" },
      [line(plato.id), line(gaseosa.id)],
      user.id,
    );
    const [platoItem, gaseosaItem] = (await orders.getOrder(order.id))!.items;

    await orders.updateItem(order.id, platoItem.id, { quantity: 3, note: "sin sal", serviceType: "TAKEAWAY" });
    await orders.removeItem(order.id, gaseosaItem.id);
    let full = await orders.getOrder(order.id);
    expect(full?.items).toHaveLength(1);
    expect(full?.items[0]).toMatchObject({ quantity: 3, note: "sin sal", serviceType: "TAKEAWAY" });
    expect(full?.totalCents).toBe(11400);

    // Simula que ya fue a cocina (eso lo hace el paso 5)
    await db.orderItem.update({ where: { id: platoItem.id }, data: { sentToKitchenAt: new Date() } });
    await expect(orders.removeItem(order.id, platoItem.id)).rejects.toThrow("anularlo con un motivo");
    full = await orders.getOrder(order.id);
    expect(full?.items).toHaveLength(1);
  });

  it("una orden pagada no se puede modificar", async () => {
    const { user, gaseosa } = await fixtures();
    const order = await orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(gaseosa.id)], user.id);
    await db.order.update({ where: { id: order.id }, data: { status: "PAID" } });
    await expect(orders.addItems(order.id, [line(gaseosa.id)])).rejects.toThrow("no se puede modificar");
  });

  it("publica los eventos con lo necesario para cocina", async () => {
    const { user, plato, gaseosa } = await fixtures();
    const order = await orders.createOrder(
      { channel: "LOCAL", serviceType: "DINE_IN", tableNumber: "7" },
      [line(plato.id, { note: "bien cocido", serviceType: "TAKEAWAY" }), line(gaseosa.id)],
      user.id,
    );
    const events = await db.domainEvent.findMany({ orderBy: { id: "asc" } });
    expect(events.map((e) => e.type)).toEqual(["order.created", "order.item_added"]);
    const added = events[1].payload as { orderId: string; items: { name: string; serviceType: string; sendsToKitchen: boolean }[] };
    expect(added.orderId).toBe(order.id);
    expect(added.items).toEqual([
      expect.objectContaining({ name: "Majadito (ejemplo)", serviceType: "TAKEAWAY", sendsToKitchen: true }),
      expect.objectContaining({ name: "Gaseosa 500 ml (ejemplo)", sendsToKitchen: false }),
    ]);
  });
});
