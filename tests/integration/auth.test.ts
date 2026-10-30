import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isWeakPin, randomPin } from "@/core/auth/pin";
import { authenticate, LOCK_MINUTES, MAX_PIN_ATTEMPTS } from "@/core/auth/service";
import { db, disconnectDb } from "@/core/db/client";

import { seed } from "../../prisma/seed-data";
import { resetDatabase } from "../support/db";

const PINS = { Admin: "4817", Caja: "5930", Cocina: "6271" };

describe("login con usuario y PIN", () => {
  let cajaId: string;

  beforeAll(async () => {
    await resetDatabase();
    const { users } = await seed(db, PINS);
    expect(users.map((u) => [u.username, u.generated])).toEqual([
      ["admin", false],
      ["caja", false],
      ["cocina", false],
    ]);
    cajaId = (await db.user.findUniqueOrThrow({ where: { username: "caja" } })).id;
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
    cajaId = (await db.user.findUniqueOrThrow({ where: { username: "caja" } })).id;
  }, 30_000);

  it("entra con usuario (sin distinguir mayúsculas) y PIN, con el rol y sus permisos", async () => {
    const r = await authenticate("  CAJA ", PINS.Caja);
    expect(r).toMatchObject({ ok: true, user: { userId: cajaId, name: "Caja", roleName: "Caja", isAdmin: false } });
    if (!r.ok) throw new Error();
    expect(r.user.permissions).toContain("sales.pos");
    expect(r.user.permissions).not.toContain("reports.view");
  });

  it("usuario inexistente, PIN incorrecto o usuario inactivo: mismo resultado", async () => {
    expect(await authenticate("nadie", PINS.Caja)).toEqual({ ok: false, reason: "invalid" });
    expect(await authenticate("caja", "0429")).toEqual({ ok: false, reason: "invalid" });
    await db.user.update({ where: { id: cajaId }, data: { active: false } });
    expect(await authenticate("caja", PINS.Caja)).toEqual({ ok: false, reason: "invalid" });
    await db.user.update({ where: { id: cajaId }, data: { active: true, failedPinAttempts: 0 } });
  });

  it("bloquea por usuario tras varios fallos seguidos y desbloquea al pasar el tiempo", async () => {
    const t0 = new Date("2026-10-17T16:00:00Z");
    for (let i = 1; i < MAX_PIN_ATTEMPTS; i++) {
      expect(await authenticate("caja", "0001", t0)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(await authenticate("caja", "0001", t0)).toEqual({ ok: false, reason: "locked", minutesLeft: LOCK_MINUTES });
    // Bloqueado: ni el PIN correcto entra. Los demás usuarios siguen entrando.
    const t1 = new Date(t0.getTime() + 5 * 60_000);
    expect(await authenticate("caja", PINS.Caja, t1)).toEqual({ ok: false, reason: "locked", minutesLeft: LOCK_MINUTES - 5 });
    expect((await authenticate("cocina", PINS.Cocina, t1)).ok).toBe(true);
    // Pasado el bloqueo entra y el contador vuelve a cero.
    const t2 = new Date(t0.getTime() + LOCK_MINUTES * 60_000 + 1);
    expect(await authenticate("caja", PINS.Caja, t2)).toMatchObject({ ok: true, user: { name: "Caja" } });
    expect(await db.user.findUniqueOrThrow({ where: { id: cajaId } })).toMatchObject({
      failedPinAttempts: 0,
      lockedUntil: null,
    });
  });

  it("un acierto reinicia el contador de fallos", async () => {
    await authenticate("caja", "0001");
    await authenticate("caja", "0001");
    expect((await authenticate("caja", PINS.Caja)).ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: cajaId } })).failedPinAttempts).toBe(0);
  });
});
