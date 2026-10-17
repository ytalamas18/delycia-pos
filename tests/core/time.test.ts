import { describe, expect, it } from "vitest";

import { addDays, businessDate, businessDayRange } from "@/core/time";

describe("día de negocio (America/La_Paz, UTC-4)", () => {
  it("una venta a las 23:30 en Santa Cruz es de ese día aunque en UTC ya sea mañana", () => {
    expect(businessDate(new Date("2026-10-17T03:30:00Z"))).toBe("2026-10-16");
  });

  it("el rango del día va de 00:00 a 24:00 hora local", () => {
    const { start, end } = businessDayRange("2026-10-16");
    expect(start.toISOString()).toBe("2026-10-16T04:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-17T04:00:00.000Z");
  });

  it("suma días cruzando meses", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
  });
});
