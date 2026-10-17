import { describe, expect, it } from "vitest";

import { addDraftLine, type DraftLine } from "@/modules/sales/domain/lines";
import { orderSubtotal } from "@/modules/sales/domain/totals";

const base: DraftLine = { productId: "p1", quantity: 1, modifierIds: [], note: "", serviceType: "DINE_IN" };

describe("líneas del pedido", () => {
  it("el mismo producto sin cambios suma cantidad", () => {
    const lines = addDraftLine(addDraftLine([], base), base);
    expect(lines).toEqual([{ ...base, quantity: 2 }]);
  });

  it("con otra nota, modificador o 'para llevar' es otra línea", () => {
    let lines = addDraftLine([], base);
    lines = addDraftLine(lines, { ...base, note: "bien cocido" });
    lines = addDraftLine(lines, { ...base, modifierIds: ["sin-cebolla"] });
    lines = addDraftLine(lines, { ...base, serviceType: "TAKEAWAY" });
    expect(lines).toHaveLength(4);
  });

  it("el orden de los modificadores no importa", () => {
    const a = { ...base, modifierIds: ["m1", "m2"] };
    const b = { ...base, modifierIds: ["m2", "m1"] };
    expect(addDraftLine([a], b)).toEqual([{ ...a, quantity: 2 }]);
  });

  it("el subtotal ignora los ítems anulados", () => {
    expect(
      orderSubtotal([
        { unitPriceCents: 3800, quantity: 2, status: "ACTIVE" },
        { unitPriceCents: 1000, quantity: 1, status: "ACTIVE" },
        { unitPriceCents: 5000, quantity: 1, status: "VOIDED" },
      ]),
    ).toBe(8600);
  });
});
