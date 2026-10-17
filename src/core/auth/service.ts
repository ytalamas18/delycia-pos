import { db } from "../db/client";
import { DomainError } from "../errors";
import { hashPin, isWeakPin, verifyPin } from "./pin";
import type { SessionUser } from "./session";

/** Tras estos fallos seguidos el usuario queda bloqueado LOCK_MINUTES (frena adivinar el PIN por internet). */
export const MAX_PIN_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

/** Usuarios que aparecen como botones en la pantalla de login. */
export function listLoginUsers() {
  return db.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
}

export type AuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; minutesLeft: number };

/** Verifica el PIN con bloqueo por intentos fallidos. "invalid" no dice qué falló (usuario o PIN). */
export async function authenticate(userId: string, pin: string, now = new Date()): Promise<AuthResult> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) return { ok: false, reason: "invalid" };

  if (user.lockedUntil && user.lockedUntil > now) {
    return {
      ok: false,
      reason: "locked",
      minutesLeft: Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60_000),
    };
  }

  if (!(await verifyPin(pin, user.pinHash))) {
    const attempts = user.failedPinAttempts + 1;
    if (attempts >= MAX_PIN_ATTEMPTS) {
      await db.user.update({
        where: { id: user.id },
        data: {
          failedPinAttempts: 0,
          lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000),
        },
      });
      return { ok: false, reason: "locked", minutesLeft: LOCK_MINUTES };
    }
    await db.user.update({
      where: { id: user.id },
      data: { failedPinAttempts: attempts },
    });
    return { ok: false, reason: "invalid" };
  }

  if (user.failedPinAttempts > 0 || user.lockedUntil) {
    await db.user.update({
      where: { id: user.id },
      data: { failedPinAttempts: 0, lockedUntil: null },
    });
  }
  return {
    ok: true,
    user: { userId: user.id, name: user.name, role: user.role },
  };
}

/**
 * El Admin cambia el PIN de cualquier usuario (incluido el suyo) confirmando con su propio PIN.
 * Cambiar el PIN también quita el bloqueo por intentos.
 */
export async function changeUserPin(input: {
  adminId: string;
  adminPin: string;
  userId: string;
  newPin: string;
  confirmPin: string;
}) {
  const admin = await db.user.findUnique({ where: { id: input.adminId } });
  if (!admin || !admin.active || !(await verifyPin(input.adminPin, admin.pinHash))) {
    throw new DomainError("Tu PIN de Admin no es correcto.", {
      adminPin: "PIN incorrecto",
    });
  }
  if (!/^\d{4}$/.test(input.newPin))
    throw new DomainError("El PIN nuevo debe tener 4 dígitos.", {
      newPin: "4 dígitos",
    });
  if (isWeakPin(input.newPin)) {
    throw new DomainError("Ese PIN es muy fácil de adivinar (ej. 1111, 1234, un año). Elige otro.", {
      newPin: "Muy fácil",
    });
  }
  if (input.newPin !== input.confirmPin)
    throw new DomainError("Los dos PIN nuevos no coinciden.", {
      confirmPin: "No coincide",
    });
  const user = await db.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new DomainError("Usuario no encontrado.");

  await db.user.update({
    where: { id: user.id },
    data: {
      pinHash: await hashPin(input.newPin),
      failedPinAttempts: 0,
      lockedUntil: null,
    },
  });
  return user.name;
}
