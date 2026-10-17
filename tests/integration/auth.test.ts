import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isWeakPin, randomPin } from "@/core/auth/pin";
import { authenticate, changeUserPin, LOCK_MINUTES, MAX_PIN_ATTEMPTS } from "@/core/auth/service";
import { db, disconnectDb } from "@/core/db/client";

import { seed } from "../../prisma/seed-data";
import { resetDatabase } from "../support/db";

const PINS = { Admin: "4817", Caja: "5930", Cocina: "6271" };

describe("PIN y login", () => {
  let adminId: string;
  let cajaId: string;

  beforeAll(async () => {
    await resetDatabase();
    const { users } = await seed(db, PINS);
    expect(users.map((u) => [u.name, u.generated])).toEqual([
      ["Admin", false],
      ["Caja", false],
      ["Cocina", false],
    ]);
    adminId = (await db.user.findUniqueOrThrow({ where: { name: "Admin" } })).id;
    cajaId = (await db.user.findUniqueOrThrow({ where: { name: "Caja" } })).id;
  });
  afterAll(disconnectDb);

  it("detecta PIN débiles y genera PIN aleatorios que no lo son", () => {
    for (const pin of ["0000", "1111", "1234", "9876", "2026", "1990"]) expect(isWeakPin(pin)).toBe(true);
    for (const pin of ["4817", "5930", "0429"]) expect(isWeakPin(pin)).toBe(false);
    for (let i = 0; i < 200; i++) expect(isWeakPin(randomPin())).toBe(false);
  });

  it("sin PIN dado, el seed genera uno aleatorio y lo devuelve una vez", async () => {
    await resetDatabase();
    const { users } = await seed(db, {});
    expect(users).toHaveLength(3);
    for (const u of users) {
      expect(u.generated).toBe(true);
      expect(u.pin).toMatch(/^\d{4}$/);
    }
    // Segunda corrida: no toca usuarios existentes.
    expect((await seed(db, {})).users).toEqual([]);
    await resetDatabase();
    await seed(db, PINS);
    adminId = (await db.user.findUniqueOrThrow({ where: { name: "Admin" } })).id;
    cajaId = (await db.user.findUniqueOrThrow({ where: { name: "Caja" } })).id;
  }, 30_000);

  it("bloquea tras varios fallos seguidos y desbloquea al pasar el tiempo", async () => {
    const t0 = new Date("2026-10-17T16:00:00Z");
    for (let i = 1; i < MAX_PIN_ATTEMPTS; i++) {
      expect(await authenticate(cajaId, "0001", t0)).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    expect(await authenticate(cajaId, "0001", t0)).toEqual({
      ok: false,
      reason: "locked",
      minutesLeft: LOCK_MINUTES,
    });
    // Bloqueado: ni el PIN correcto entra.
    const t1 = new Date(t0.getTime() + 5 * 60_000);
    expect(await authenticate(cajaId, PINS.Caja, t1)).toEqual({
      ok: false,
      reason: "locked",
      minutesLeft: LOCK_MINUTES - 5,
    });
    // Pasado el bloqueo entra y el contador vuelve a cero.
    const t2 = new Date(t0.getTime() + LOCK_MINUTES * 60_000 + 1);
    expect(await authenticate(cajaId, PINS.Caja, t2)).toMatchObject({
      ok: true,
      user: { name: "Caja", role: "CASHIER" },
    });
    expect(await db.user.findUniqueOrThrow({ where: { id: cajaId } })).toMatchObject({
      failedPinAttempts: 0,
      lockedUntil: null,
    });
  });

  it("un acierto reinicia el contador de fallos", async () => {
    await authenticate(cajaId, "0001");
    await authenticate(cajaId, "0001");
    expect((await authenticate(cajaId, PINS.Caja)).ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: cajaId } })).failedPinAttempts).toBe(0);
  });

  it("el Admin cambia un PIN confirmando con el suyo; quita el bloqueo", async () => {
    for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) await authenticate(cajaId, "0001");
    expect((await authenticate(cajaId, PINS.Caja)).ok).toBe(false);

    const base = { adminId, adminPin: PINS.Admin, userId: cajaId };
    await expect(
      changeUserPin({
        ...base,
        adminPin: "9999",
        newPin: "3816",
        confirmPin: "3816",
      }),
    ).rejects.toThrow("Tu PIN de Admin no es correcto.");
    await expect(changeUserPin({ ...base, newPin: "1234", confirmPin: "1234" })).rejects.toThrow("muy fácil");
    await expect(changeUserPin({ ...base, newPin: "3816", confirmPin: "3817" })).rejects.toThrow("no coinciden");

    expect(await changeUserPin({ ...base, newPin: "3816", confirmPin: "3816" })).toBe("Caja");
    expect((await authenticate(cajaId, PINS.Caja)).ok).toBe(false);
    expect((await authenticate(cajaId, "3816")).ok).toBe(true);
  });
});
