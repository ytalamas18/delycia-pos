import { db } from "../db/client";
import { DomainError } from "../errors";
import { can, effectivePermissions, type Permission } from "./permissions";
import { hashPin, verifyPin } from "./pin";
import type { SessionClaims, SessionUser } from "./session";

/** Tras estos fallos seguidos el usuario queda bloqueado LOCK_MINUTES (frena adivinar el PIN por internet). */
export const MAX_PIN_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

/** Mensaje único de login fallido: no dice si el usuario existe, si el PIN falló o si está bloqueado. */
export const LOGIN_ERROR = "Usuario o PIN incorrecto.";

/** Los nombres de usuario se guardan y comparan en minúsculas. */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

type UserWithRole = {
  id: string;
  name: string;
  username: string;
  active: boolean;
  sessionVersion: number;
  role: { id: string; name: string; systemKey: string | null; permissions: string[]; active: boolean };
};

const withRole = { role: { select: { id: true, name: true, systemKey: true, permissions: true, active: true } } } as const;

function toSessionUser(user: UserWithRole): SessionUser {
  return {
    userId: user.id,
    name: user.name,
    username: user.username,
    roleId: user.role.id,
    roleName: user.role.name,
    isAdmin: user.role.systemKey === "ADMIN",
    permissions: effectivePermissions(user.role),
  };
}

/**
 * El usuario de una cookie, con los permisos actuales de su rol. null si ya no puede entrar
 * (desactivado, rol desactivado o PIN reseteado después de iniciar sesión).
 */
export async function loadSessionUser(claims: SessionClaims): Promise<SessionUser | null> {
  const user = await db.user.findUnique({ where: { id: claims.userId }, include: withRole });
  if (!user || !user.active || !user.role.active || user.sessionVersion !== claims.sessionVersion) return null;
  return toSessionUser(user);
}

// Hash de un PIN cualquiera: si el usuario no existe se compara igual, así la respuesta tarda lo mismo.
let dummyHash: Promise<string> | undefined;
async function fakeVerify(pin: string) {
  await verifyPin(pin, await (dummyHash ??= hashPin("0000")));
}

export type AuthResult =
  | { ok: true; user: SessionUser; sessionVersion: number }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; minutesLeft: number };

/**
 * Verifica usuario + PIN con bloqueo por intentos fallidos (por usuario). El motivo es para los tests y
 * los logs: a la persona siempre se le muestra LOGIN_ERROR.
 */
export async function authenticate(username: string, pin: string, now = new Date()): Promise<AuthResult> {
  const user = await db.user.findUnique({ where: { username: normalizeUsername(username) }, include: withRole });
  if (!user || !user.active || !user.role.active) {
    await fakeVerify(pin);
    return { ok: false, reason: "invalid" };
  }

  if (user.lockedUntil && user.lockedUntil > now) {
    await fakeVerify(pin);
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
  return { ok: true, user: toSessionUser(user), sessionVersion: user.sessionVersion };
}

/**
 * Autorización de otra persona para una acción delicada (ej. anular desde Caja): escribe su usuario y PIN,
 * con el mismo bloqueo por intentos que el login, y su rol debe tener `permission`. Devuelve quién autorizó.
 */
export async function authorizeAction(
  input: { username: string; pin: string },
  permission: Permission,
  now = new Date(),
): Promise<SessionUser> {
  if (!input.username.trim()) throw new DomainError("Ingresa el usuario de quien autoriza.", { authUsername: "Obligatorio" });
  if (!/^\d{4}$/.test(input.pin)) throw new DomainError("Ingresa el PIN de quien autoriza (4 dígitos).", { authPin: "4 dígitos" });
  const result = await authenticate(input.username, input.pin, now);
  // Sin fieldErrors: el diálogo muestra la frase completa.
  if (!result.ok) throw new DomainError(`${LOGIN_ERROR} Tras ${MAX_PIN_ATTEMPTS} intentos fallidos se bloquea ${LOCK_MINUTES} min.`);
  if (!can(result.user, permission)) throw new DomainError(`${result.user.name} no tiene permiso para autorizar esto.`);
  return result.user;
}
