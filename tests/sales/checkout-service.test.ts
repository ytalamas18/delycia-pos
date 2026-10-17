import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db, disconnectDb } from "@/core/db/client";
import { eventBus } from "@/core/db/transaction";
import { kitchenModule } from "@/modules/kitchen";
import { salesModule } from "@/modules/sales";

import * as tickets from "@/modules/kitchen/services/tickets";
import * as checkout from "@/modules/sales/services/checkout";
import * as orders from "@/modules/sales/services/orders";

import { seed } from "../../prisma/seed-data";
import { resetDatabase } from "../support/db";

const line = (productId: string, extra: Record<string, unknown> = {}) => ({
  productId,
  quantity: 1,
  modifierIds: [] as string[],
  note: "",
  serviceType: "TAKEAWAY" as const,
  ...extra,
});

async function fixtures() {
  await seed(db);
  const caja = await db.user.findUniqueOrThrow({ where: { name: "Caja" } });
  const plato = await db.product.findFirstOrThrow({ where: { name: "Majadito (ejemplo)" } });
  const gaseosa = await db.product.findFirstOrThrow({ where: { name: "Gaseosa 500 ml (ejemplo)" } });
  return { caja, plato, gaseosa };
}

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

describe("cobrar una orden", () => {
  it("con descuento % y efectivo con vuelto; solo bebidas → queda CERRADA", async () => {
    const { caja, gaseosa } = await fixtures();
    const order = await orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(gaseosa.id, { quantity: 5 })], caja.id);
    // 50 Bs - 10 % = 45; entrega 50 → vuelto 5
    const result = await checkout.payOrder(
      order.id,
      { discount: { type: "PERCENT", value: 10 }, entries: [{ method: "CASH", amountCents: 5000 }] },
      caja.id,
    );
    expect(result).toEqual({ number: 1, totalCents: 4500, changeCents: 500 });

    const paid = await orders.getOrder(order.id);
    expect(paid).toMatchObject({ status: "CLOSED", subtotalCents: 5000, discountCents: 500, totalCents: 4500 });
    expect(paid?.payments).toEqual([
      expect.objectContaining({ method: "CASH", amountCents: 4500, tenderedCents: 5000, changeCents: 500 }),
    ]);
  });

  it("pago mixto QR + efectivo", async () => {
    const { caja, plato, gaseosa } = await fixtures();
    const order = await orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(plato.id), line(gaseosa.id)], caja.id);
    await checkout.payOrder(
      order.id,
      { discount: null, entries: [{ method: "QR", amountCents: 3000 }, { method: "CASH", amountCents: 2000 }] },
      caja.id,
    );
    const paid = await orders.getOrder(order.id);
    expect(paid?.payments.map((p) => [p.method, p.amountCents, p.changeCents])).toEqual([
      ["QR", 3000, null],
      ["CASH", 1800, 200],
    ]);
  });

  it("pagada antes de cocina (para llevar): queda PAGADA y se CIERRA al entregar la comanda", async () => {
    const { caja, plato } = await fixtures();
    const order = await orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(plato.id)], caja.id);
    await checkout.payOrder(order.id, { discount: null, entries: [{ method: "CARD", amountCents: 3800 }] }, caja.id);
    expect((await orders.getOrder(order.id))?.status).toBe("PAID"); // el plato aún no fue a cocina

    await orders.sendToKitchen(order.id); // se puede enviar estando pagada
    const ticket = await db.kitchenTicket.findFirstOrThrow({ where: { orderId: order.id } });
    for (let i = 0; i < 3; i++) await tickets.advanceTicket(ticket.id, caja.id);
    expect((await orders.getOrder(order.id))?.status).toBe("CLOSED");

    // Deshacer la entrega reabre la orden a PAGADA
    await tickets.undoTicket(ticket.id, caja.id);
    expect((await orders.getOrder(order.id))?.status).toBe("PAID");
  });

  it("una orden pagada no se cobra dos veces ni se modifica", async () => {
    const { caja, gaseosa } = await fixtures();
    const order = await orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(gaseosa.id)], caja.id);
    await checkout.payOrder(order.id, { discount: null, entries: [{ method: "QR", amountCents: 1000 }] }, caja.id);
    await expect(
      checkout.payOrder(order.id, { discount: null, entries: [{ method: "QR", amountCents: 1000 }] }, caja.id),
    ).rejects.toThrow("ya fue cobrada");
    await expect(orders.addItems(order.id, [line(gaseosa.id)])).rejects.toThrow("no se puede modificar");
  });

  it("si falta dinero no cobra nada", async () => {
    const { caja, plato } = await fixtures();
    const order = await orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(plato.id)], caja.id);
    await expect(
      checkout.payOrder(order.id, { discount: null, entries: [{ method: "CASH", amountCents: 2000 }] }, caja.id),
    ).rejects.toThrow("Falta cobrar");
    expect((await orders.getOrder(order.id))?.status).toBe("OPEN");
    expect(await db.payment.count()).toBe(0);
  });
});

describe("cuentas por cobrar (fiado)", () => {
  it("exige el nombre del cliente", async () => {
    const { caja, plato } = await fixtures();
    const order = await orders.createOrder({ channel: "LOCAL", serviceType: "TAKEAWAY" }, [line(plato.id)], caja.id);
    await expect(
      checkout.payOrder(order.id, { discount: null, entries: [{ method: "CREDIT", amountCents: 3800 }] }, caja.id),
    ).rejects.toThrow("nombre del cliente");
  });

  it("registra la deuda, acepta abonos y se salda al completar", async () => {
    const { caja, plato, gaseosa } = await fixtures();
    const order = await orders.createOrder(
      { channel: "LOCAL", serviceType: "TAKEAWAY" },
      [line(plato.id), line(gaseosa.id)],
      caja.id,
    );
    // 48 Bs: 8 en efectivo y 40 fiado a nombre de Don Pedro
    await checkout.payOrder(
      order.id,
      {
        discount: null,
        entries: [{ method: "CASH", amountCents: 800 }, { method: "CREDIT", amountCents: 4000 }],
        customerName: "Don Pedro",
      },
      caja.id,
    );

    let open = await checkout.listOpenReceivables();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ debtorName: "Don Pedro", amountCents: 4000, balanceCents: 4000, orderNumber: 1 });

    await checkout.collectCredit(open[0].paymentId, { method: "QR", amountCents: 1500 }, caja.id);
    open = await checkout.listOpenReceivables();
    expect(open[0]).toMatchObject({ collectedCents: 1500, balanceCents: 2500 });

    await expect(
      checkout.collectCredit(open[0].paymentId, { method: "CASH", amountCents: 3000 }, caja.id),
    ).rejects.toThrow("supera");
    await expect(
      checkout.collectCredit(open[0].paymentId, { method: "CREDIT", amountCents: 100 }, caja.id),
    ).rejects.toThrow("efectivo, QR o tarjeta");

    const done = await checkout.collectCredit(open[0].paymentId, { method: "CASH", amountCents: 2500 }, caja.id);
    expect(done).toEqual({ settled: true, balanceCents: 0 });
    expect(await checkout.listOpenReceivables()).toEqual([]);
    expect((await checkout.listSettledReceivables())[0].collections).toHaveLength(2);
  });
});
