import { describe, expect, it } from "vitest";

import { unitPriceFor } from "@/modules/sales";

describe("precio por canal", () => {
  it("LOCAL cobra el precio de lista", () => {
    expect(unitPriceFor({ listPriceCents: 3800, channel: "LOCAL", markupPercent: 40 })).toBe(3800);
  });

  it("PEYA suma el % y redondea al boliviano (38 Bs + 40 % = 53,20 → 53 Bs)", () => {
    expect(unitPriceFor({ listPriceCents: 3800, channel: "PEYA", markupPercent: 40 })).toBe(5300);
  });

  it("PEYA redondea .50 hacia arriba y también aplica a bebidas", () => {
    // 25 Bs + 40 % = 35,00
    expect(unitPriceFor({ listPriceCents: 2500, channel: "PEYA", markupPercent: 40 })).toBe(3500);
    // 10 Bs + 35 % = 13,50 → 14
    expect(unitPriceFor({ listPriceCents: 1000, channel: "PEYA", markupPercent: 35 })).toBe(1400);
    // 6 Bs + 40 % = 8,40 → 8
    expect(unitPriceFor({ listPriceCents: 600, channel: "PEYA", markupPercent: 40 })).toBe(800);
  });

  it("los modificadores con precio suman antes del recargo", () => {
    const modifiers = [
      { name: "Extra huevo", priceDeltaCents: 500 },
      { name: "Sin cebolla", priceDeltaCents: 0 },
    ];
    expect(unitPriceFor({ listPriceCents: 3800, modifiers, channel: "LOCAL", markupPercent: 40 })).toBe(4300);
    // (38 + 5) × 1,4 = 60,20 → 60
    expect(unitPriceFor({ listPriceCents: 3800, modifiers, channel: "PEYA", markupPercent: 40 })).toBe(6000);
  });
});
