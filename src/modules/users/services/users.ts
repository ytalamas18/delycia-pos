import { isWeakPin, hashPin } from "@/core/auth/pin";
import { authenticate } from "@/core/auth/service";
import type { SessionUser } from "@/core/auth/session";
import { db } from "@/core/db/client";
import { runInTransaction, type Tx } from "@/core/db/transaction";
import { DomainError } from "@/core/errors";

import { pinFields, userInput, type UserInput } from "../schemas";
import { ADMIN_SYSTEM_KEY } from "./roles";

export async function listUsers() {
  const users = await db.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      username: true,
      active: true,
      lockedUntil: true,
      role: { select: { id: true, name: true, systemKey: true, active: true } },
    },
  });
  const now = new Date();
  return users.map((u) => ({ ...u, locked: !!u.lockedUntil && u.lockedUntil > now }));
}

export type UserRow = Awaited<ReturnType<typeof listUsers>>[number];

export async function getUser(id: string) {
  return db.user.findUnique({
    where: { id },
    select: { id: true, name: true, username: true, active: true, roleId: true, role: { select: { name: true, systemKey: true } } },
  });
}

/** Roles que se pueden asignar (activos). Solo un Admin puede asignar el rol Admin. */
export async function assignableRoles(actor: SessionUser) {
  const roles = await db.role.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, systemKey: true } });
  return roles.filter((r) => actor.isAdmin || r.systemKey !== ADMIN_SYSTEM_KEY);
}

async function loadAssignableRole(tx: Tx, roleId: string, actor: SessionUser) {
  const role = await tx.role.findUnique({ where: { id: roleId } });
  if (!role) throw new DomainError("Elige un rol.", { roleId: "Elige un rol" });
  if (!role.active) throw new DomainError("Ese rol está desactivado.", { roleId: "Rol desactivado" });
  if (role.systemKey === ADMIN_SYSTEM_KEY && !actor.isAdmin) {
    throw new DomainError("Solo un Admin puede dar el rol Admin.", { roleId: "Sin permiso" });
  }
  return role;
}

function validatePin(fields: { newPin: string; confirmPin: string }) {
  const { newPin } = pinFields.parse(fields);
  if (isWeakPin(newPin)) {
    throw new DomainError("Ese PIN es muy fácil de adivinar (ej. 1111, 1234, un año). Elige otro.", { newPin: "Muy fácil" });
  }
  return newPin;
}

/** Bloquea las filas de los Admin activos: dos cambios a la vez no pueden dejar el sistema sin Admin. */
async function lockActiveAdmins(tx: Tx) {
  return tx.$queryRaw<{ id: string }[]>`
    SELECT u.id FROM "User" u JOIN "AccessRole" r ON r.id = u."roleId"
    WHERE r."systemKey" = ${ADMIN_SYSTEM_KEY} AND u.active
    FOR UPDATE OF u`;
}

export async function createUser(input: UserInput & { newPin: string; confirmPin: string }, actor: SessionUser) {
  const data = userInput.parse(input);
  const pin = validatePin(input);
  const pinHash = await hashPin(pin);
  return runInTransaction(async (tx) => {
    await loadAssignableRole(tx, data.roleId, actor);
    return tx.user.create({
      data: { name: data.name, username: data.username, roleId: data.roleId, active: data.active, pinHash },
    });
  });
}

/**
 * Edita nombre, usuario, rol y estado. Reglas: siempre queda al menos un Admin activo; nadie se desactiva
 * ni se quita el rol Admin a sí mismo; solo un Admin edita a otro Admin o da ese rol. Desactivar o cambiar
 * el rol aplica al instante (la sesión lee el usuario en cada request).
 */
export async function updateUser(id: string, input: UserInput, actor: SessionUser) {
  const data = userInput.parse(input);
  return runInTransaction(async (tx) => {
    const admins = await lockActiveAdmins(tx);
    const user = await tx.user.findUnique({ where: { id }, include: { role: true } });
    if (!user) throw new DomainError("Usuario no encontrado.");
    const wasAdmin = user.role.systemKey === ADMIN_SYSTEM_KEY;
    if (wasAdmin && !actor.isAdmin) throw new DomainError("Solo un Admin puede editar a otro Admin.");

    const role = data.roleId === user.roleId ? user.role : await loadAssignableRole(tx, data.roleId, actor);
    const staysAdmin = role.systemKey === ADMIN_SYSTEM_KEY && data.active;

    if (id === actor.userId) {
      if (!data.active) throw new DomainError("No puedes desactivarte a ti mismo.", { active: "Es tu usuario" });
      if (wasAdmin && !staysAdmin) throw new DomainError("No puedes quitarte el rol Admin.", { roleId: "Es tu usuario" });
    }
    if (wasAdmin && user.active && !staysAdmin && admins.length <= 1) {
      throw new DomainError("Debe quedar al menos un Admin activo.");
    }

    return tx.user.update({
      where: { id },
      data: { name: data.name, username: data.username, roleId: role.id, active: data.active },
    });
  });
}

/**
 * Resetea el PIN de un usuario confirmando con el PIN de quien lo hace (con el bloqueo por intentos del login).
 * También quita el bloqueo y cierra todas sus sesiones abiertas (sube sessionVersion).
 */
export async function resetPin(
  input: { userId: string; newPin: string; confirmPin: string; actorPin: string },
  actor: SessionUser,
) {
  const check = await authenticate(actor.username, input.actorPin);
  if (!check.ok) throw new DomainError("Tu PIN no es correcto.", { actorPin: "PIN incorrecto" });
  const pin = validatePin(input);

  const user = await db.user.findUnique({ where: { id: input.userId }, include: { role: { select: { systemKey: true } } } });
  if (!user) throw new DomainError("Usuario no encontrado.");
  if (user.role.systemKey === ADMIN_SYSTEM_KEY && !actor.isAdmin) {
    throw new DomainError("Solo un Admin puede cambiar el PIN de un Admin.");
  }
  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      pinHash: await hashPin(pin),
      failedPinAttempts: 0,
      lockedUntil: null,
      sessionVersion: { increment: 1 },
    },
  });
  return { name: updated.name, sessionVersion: updated.sessionVersion, self: updated.id === actor.userId };
}
