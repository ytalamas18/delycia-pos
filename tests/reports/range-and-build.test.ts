import { describe, expect, it } from "vitest";

import { buildProducts } from "@/modules/reports/domain/products";
import { eachDay, MAX_RANGE_DAYS, parseRange, rangePresets } from "@/modules/reports/domain/range";
import { buildSalesByChannel } from "@/modules/reports/domain/sales";

describe("rango de fechas (día de negocio en La Paz)", () => {
  // 03:30 UTC del 18 = 23:30 del 17 en La Paz (UTC-4): "Hoy" todavía es el 17.
  const lateNight = new Date("2026-10-18T03:30:00Z");

  it("los atajos usan el día de La Paz, no el de UTC", () => {
    const p = Object.fromEntries(rangePresets(lateNight).map((x) => [x.key, x.range]));
    expect(p.hoy).toEqual({ from: "2026-10-17", to: "2026-10-17" });
    expect(p.ayer).toEqual({ from: "2026-10-16", to: "2026-10-16" });
    expect(p["7d"]).toEqual({ from: "2026-10-11", to: "2026-10-17" });
    expect(p.mes).toEqual({ from: "2026-10-01", to: "2026-10-17" });
    // A las 04:00 UTC ya es el 18 en La Paz.
    expect(rangePresets(new Date("2026-10-18T04:00:00Z"))[0].range.from).toBe("2026-10-18");
  });

  it("valida, da vuelta y recorta el rango", () => {
    expect(parseRange({}, lateNight)).toEqual({ from: "2026-10-17", to: "2026-10-17" });
    expect(parseRange({ desde: "basura" }, lateNight)).toEqual({ from: "2026-10-17", to: "2026-10-17" });
    expect(parseRange({ desde: "2026-10-10", hasta: "2026-10-01" })).toEqual({ from: "2026-10-01", to: "2026-10-10" });
    expect(parseRange({ desde: "2026-10-05" })).toEqual({ from: "2026-10-05", to: "2026-10-05" });
    const long = parseRange({ desde: "2020-01-01", hasta: "2026-10-17" });
    expect(eachDay(long)).toHaveLength(MAX_RANGE_DAYS);
    expect(long.to).toBe("2026-10-17");
  });

  it("eachDay incluye ambos extremos y cruza meses", () => {
    expect(eachDay({ from: "2026-09-29", to: "2026-10-02" })).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
  });
});

describe("reporte por canal (cálculo)", () => {
  it("totales por canal y por día, ticket promedio y anuladas aparte", () => {
    const r = buildSalesByChannel(
      { from: "2026-10-16", to: "2026-10-17" },
      {
        byChannel: [
          { day: "2026-10-16", channel: "CASH", orders: 2, totalCents: 6000 },
          // orden mixta (QR + efectivo) cuenta en los dos canales…
          { day: "2026-10-17", channel: "CASH", orders: 1, totalCents: 1000 },
          { day: "2026-10-17", channel: "QR", orders: 1, totalCents: 3000 },
        ],
        // …pero una sola vez en el total del día
        byDay: [
          { day: "2026-10-16", orders: 2, totalCents: 6000 },
          { day: "2026-10-17", orders: 1, totalCents: 4000 },
        ],
        cancelledByDay: [{ day: "2026-10-17", orders: 1, totalCents: 3800 }],
      },
    );
    expect(r.channels.slice(0, 5)).toEqual(["CASH", "QR", "CARD", "PEYA", "CREDIT"]);
    expect(r.days[0].byChannel.CASH).toEqual({ orders: 2, totalCents: 6000, averageCents: 3000 });
    expect(r.days[1].total).toEqual({ orders: 1, totalCents: 4000, averageCents: 4000 });
    expect(r.totals.byChannel.CASH).toEqual({ orders: 3, totalCents: 7000, averageCents: 2333 });
    expect(r.totals.byChannel.CARD).toEqual({ orders: 0, totalCents: 0, averageCents: 0 });
    expect(r.totals.total).toEqual({ orders: 3, totalCents: 10000, averageCents: 3333 });
    expect(r.totals.cancelled).toMatchObject({ orders: 1, totalCents: 3800 });
  });

  it("un canal nuevo (ej. DELIVERY) aparece solo, después de los conocidos", () => {
    const r = buildSalesByChannel(
      { from: "2026-10-17", to: "2026-10-17" },
      { byChannel: [{ day: "2026-10-17", channel: "DELIVERY", orders: 1, totalCents: 500 }], byDay: [], cancelledByDay: [] },
    );
    expect(r.channels.at(-1)).toBe("DELIVERY");
    expect(r.totals.byChannel.DELIVERY.totalCents).toBe(500);
  });
});

describe("reporte de productos (cálculo)", () => {
  const row = (name: string, quantity: number, totalCents: number) => ({ productId: name, name, category: null, quantity, totalCents });

  it("ordena de mayor a menor por cantidad o por monto y suma totales", () => {
    const sold = [row("Agua", 5, 3000), row("Lomito", 2, 7000), row("Papas", 5, 8000)];
    expect(buildProducts(sold, [], "cantidad").products.map((p) => p.name)).toEqual(["Papas", "Agua", "Lomito"]);
    const byAmount = buildProducts(sold, [row("Lomito", 1, 3500)], "monto");
    expect(byAmount.products.map((p) => p.name)).toEqual(["Papas", "Lomito", "Agua"]);
    expect(byAmount.totals).toEqual({ quantity: 12, totalCents: 18000 });
    expect(byAmount.voided).toMatchObject({ quantity: 1, totalCents: 3500 });
  });
});
