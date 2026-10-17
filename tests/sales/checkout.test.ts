import { describe, expect, it } from "vitest";

import { discountCents, settle } from "@/modules/sales/domain/checkout";

describe("descuentos", () => {
  it("por monto y por porcentaje (redondeado al centavo)", () => {
    expect(discountCents(9600, { type: "AMOUNT", value: 600 })).toBe(600);
    expect(discountCents(9600, { type: "PERCENT", value: 10 })).toBe(960);
    expect(discountCents(3850, { type: "PERCENT", value: 12.5 })).toBe(481);
  });

  it("nunca deja la cuenta en negativo", () => {
    expect(discountCents(3800, { type: "AMOUNT", value: 5000 })).toBe(3800);
    expect(discountCents(3800, { type: "PERCENT", value: 150 })).toBe(3800);
    expect(discountCents(3800, { type: "AMOUNT", value: -100 })).toBe(0);
    expect(discountCents(3800, null)).toBe(0);
  });
});

describe("cobro", () => {
  it("efectivo con vuelto: cuenta 86 Bs, entrega 100 → vuelto 14", () => {
    const r = settle(8600, [{ method: "CASH", amountCents: 10000 }]);
    expect(r).toEqual({
      ok: true,
      changeCents: 1400,
      payments: [{ method: "CASH", amountCents: 8600, tenderedCents: 10000, changeCents: 1400 }],
    });
  });

  it("efectivo exacto: vuelto 0", () => {
    const r = settle(3800, [{ method: "CASH", amountCents: 3800 }]);
    expect(r.ok && r.changeCents).toBe(0);
  });

  it("falta dinero: dice cuánto falta", () => {
    expect(settle(8600, [{ method: "CASH", amountCents: 5000 }])).toMatchObject({ ok: false, missingCents: 3600 });
  });

  it("QR o tarjeta deben ser exactos (no dan vuelto)", () => {
    expect(settle(3800, [{ method: "QR", amountCents: 3800 }])).toMatchObject({ ok: true, changeCents: 0 });
    expect(settle(3800, [{ method: "CARD", amountCents: 4000 }]).ok).toBe(false);
    expect(settle(3800, [{ method: "QR", amountCents: 3000 }])).toMatchObject({ ok: false, missingCents: 800 });
  });

  it("pago mixto: 100 Bs = 60 por QR + efectivo (entrega 50 → vuelto 10)", () => {
    const r = settle(10000, [
      { method: "QR", amountCents: 6000 },
      { method: "CASH", amountCents: 5000 },
    ]);
    expect(r).toEqual({
      ok: true,
      changeCents: 1000,
      payments: [
        { method: "QR", amountCents: 6000, tenderedCents: null, changeCents: null },
        { method: "CASH", amountCents: 4000, tenderedCents: 5000, changeCents: 1000 },
      ],
    });
  });

  it("pago mixto sin efectivo: tarjeta + cuenta por cobrar", () => {
    const r = settle(10000, [
      { method: "CARD", amountCents: 4000 },
      { method: "CREDIT", amountCents: 6000 },
    ]);
    expect(r.ok).toBe(true);
  });

  it("si otro método ya cubre todo, no acepta además efectivo", () => {
    expect(
      settle(3800, [
        { method: "QR", amountCents: 3800 },
        { method: "CASH", amountCents: 1000 },
      ]).ok,
    ).toBe(false);
  });

  it("sin pagos o con montos en cero, no cobra", () => {
    expect(settle(3800, []).ok).toBe(false);
    expect(settle(3800, [{ method: "CASH", amountCents: 0 }]).ok).toBe(false);
  });
});
