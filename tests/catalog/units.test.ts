import { describe, expect, it } from "vitest";

import { formatQuantity, parseQuantity } from "@/core/quantity";
import { compatibleUnits, formatUnitCost, parseUnitCost, toBaseQuantity, unitFactor } from "@/modules/catalog";

describe("cantidades", () => {
  it("lee coma o punto y limita a 3 decimales", () => {
    expect(parseQuantity("1,5").toString()).toBe("1.5");
    expect(parseQuantity(" 250 ").toString()).toBe("250");
    expect(() => parseQuantity("1,2345")).toThrow();
    expect(() => parseQuantity("abc")).toThrow();
    expect(formatQuantity(parseQuantity("2.500"))).toBe("2,5");
  });
});

describe("conversión de unidades", () => {
  it("convierte dentro de la misma familia", () => {
    expect(unitFactor("KG", "G").toString()).toBe("1000");
    expect(unitFactor("G", "KG").toString()).toBe("0.001");
    expect(unitFactor("L", "ML").toString()).toBe("1000");
    expect(unitFactor("UNIT", "UNIT").toString()).toBe("1");
    expect(compatibleUnits("G")).toEqual(["KG", "G"]);
    expect(compatibleUnits("UNIT")).toEqual(["UNIT"]);
  });

  it("no mezcla peso, volumen y unidades", () => {
    expect(() => unitFactor("KG", "L")).toThrow("No se puede convertir");
    expect(() => unitFactor("UNIT", "G")).toThrow();
  });

  it("presentación: 2 bolsas x12 = 24 unidades", () => {
    expect(toBaseQuantity("2", "UNIT", { presentationFactor: "12" }).toString()).toBe("24");
    expect(toBaseQuantity("1,5".replace(",", "."), "G", { presentationFactor: "500" }).toString()).toBe("750");
  });

  it("unidad compatible: 1,5 kg en un ítem en gramos = 1500 g; 250 g en un ítem en kg = 0,25 kg", () => {
    expect(toBaseQuantity("1.5", "G", { unit: "KG" }).toString()).toBe("1500");
    expect(toBaseQuantity("250", "KG", { unit: "G" }).toString()).toBe("0.25");
    expect(toBaseQuantity("0.4", "KG", { unit: "G" }).toString()).toBe("0"); // 0,0004 kg → redondea a 3 decimales
  });
});

describe("costo unitario", () => {
  it("admite hasta 4 decimales en Bs y se guarda en centavos", () => {
    expect(parseUnitCost("0,045").toString()).toBe("4.5");
    expect(parseUnitCost("38").toString()).toBe("3800");
    expect(() => parseUnitCost("0,00001")).toThrow();
    expect(formatUnitCost(parseUnitCost("0,045")).replace(/\s/g, " ")).toBe("Bs 0,045");
    expect(formatUnitCost(3800).replace(/\s/g, " ")).toBe("Bs 38,00");
  });
});
