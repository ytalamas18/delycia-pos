import { describe, expect, it } from "vitest";

import { unitPriceFor } from "@/modules/sales";

describe("precio por canal", () => {
  it("LOCAL cobra el precio de lista", () => {
    expect(unitPriceFor({ listPriceCents: 3800, channel: "LOCAL", markupPercent: 40 })).toBe(3800);
  });

  it("PEYA suma el % configurado (38 Bs + 40 % = 53,20 Bs)", () => {
    expect(unitPriceFor({ listPriceCents: 3800, channel: "PEYA", markupPercent: 40 })).toBe(5320);
  });

  it("PEYA también aplica a bebidas y redondea al centavo", () => {
    // 10 Bs + 12,5 % = 11,25 Bs
    expect(unitPriceFor({ listPriceCents: 1000, channel: "PEYA", markupPercent: 12.5 })).toBe(1125);
    // 3,33 Bs + 40 % = 4,662 → 4,66 Bs
    expect(unitPriceFor({ listPriceCents: 333, channel: "PEYA", markupPercent: 40 })).toBe(466);
  });

  it("los modificadores con precio suman antes del recargo", () => {
    const modifiers = [
      { name: "Extra huevo", priceDeltaCents: 500 },
      { name: "Sin cebolla", priceDeltaCents: 0 },
    ];
    expect(unitPriceFor({ listPriceCents: 3800, modifiers, channel: "LOCAL", markupPercent: 40 })).toBe(4300);
    expect(unitPriceFor({ listPriceCents: 3800, modifiers, channel: "PEYA", markupPercent: 40 })).toBe(6020);
  });
});
