import { describe, expect, it } from "vitest";

import { assertCents, formatMoney, parseMoney, percentOf } from "@/core/money";

describe("dinero en centavos", () => {
  it("parsea montos escritos a mano", () => {
    expect(parseMoney("38")).toBe(3800);
    expect(parseMoney("38,5")).toBe(3850);
    expect(parseMoney("38.50")).toBe(3850);
    expect(parseMoney("1.234,50")).toBe(123450);
    expect(parseMoney("Bs 12")).toBe(1200);
  });

  it("rechaza texto inválido", () => {
    expect(() => parseMoney("abc")).toThrow();
    expect(() => parseMoney("-5")).toThrow();
  });

  it("formatea con el símbolo de la config", () => {
    expect(formatMoney(3800)).toBe("Bs 38,00");
  });

  it("calcula porcentajes redondeando al centavo (half-up)", () => {
    expect(percentOf(3800, 10)).toBe(380);
    expect(percentOf(3850, 12.5)).toBe(481); // 481,25 → 481
    expect(percentOf(1, 50)).toBe(1); // 0,5 → 1
  });

  it("no acepta floats", () => {
    expect(() => assertCents(10.5)).toThrow();
  });
});
