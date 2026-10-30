import { ALL_PERMISSIONS, can, effectivePermissions, type Permission } from "@/core/auth/permissions";
import type { SessionUser } from "@/core/auth/session";
import { db } from "@/core/db/client";
import { DomainError } from "@/core/errors";

import { roleInput, roleNameKey, type RoleInput } from "../schemas";

export const ADMIN_SYSTEM_KEY = "ADMIN";

export async function listRoles() {
  const roles = await db.role.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { _count: { select: { users: { where: { active: true } } } } },
  });
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    systemKey: r.systemKey,
    isAdmin: r.systemKey === ADMIN_SYSTEM_KEY,
    active: r.active,
    permissions: effectivePermissions(r),
    activeUsers: r._count.users,
  }));
}

export type RoleRow = Awaited<ReturnType<typeof listRoles>>[number];

export async function getRole(id: string) {
  const role = await db.role.findUnique({ where: { id } });
  if (!role) return null;
  return { ...role, isAdmin: role.systemKey === ADMIN_SYSTEM_KEY, permissions: effectivePermissions(role) };
}

/** Nadie da permisos que no tiene (frena que un encargado con "Usuarios" se suba de nivel). */
function assertCanGrant(actor: SessionUser, permissions: readonly Permission[]) {
  const missing = permissions.filter((p) => !can(actor, p));
  if (missing.length > 0) throw new DomainError("Solo puedes dar permisos que tu propio rol tiene.");
}

export async function createRole(input: RoleInput, actor: SessionUser) {
  const data = roleInput.parse(input);
  assertCanGrant(actor, data.permissions as Permission[]);
  return db.role.create({
    data: { name: data.name, nameKey: roleNameKey(data.name), permissions: data.permissions, active: data.active },
  });
}

/**
 * Edita nombre, permisos y estado. El rol Admin solo se puede renombrar (tiene todos los permisos y siempre
 * está activo). Un rol con usuarios activos no se desactiva. El cambio aplica al instante: las sesiones leen
 * los permisos del rol en cada request.
 */
export async function updateRole(id: string, input: RoleInput, actor: SessionUser) {
  const data = roleInput.parse(input);
  const role = await db.role.findUnique({ where: { id }, include: { _count: { select: { users: { where: { active: true } } } } } });
  if (!role) throw new DomainError("Rol no encontrado.");

  if (role.systemKey === ADMIN_SYSTEM_KEY) {
    if (!actor.isAdmin) throw new DomainError("Solo un Admin puede editar el rol Admin.");
    if (!data.active) throw new DomainError("El rol Admin no se puede desactivar.");
    return db.role.update({ where: { id }, data: { name: data.name, nameKey: roleNameKey(data.name) } });
  }

  // Solo se revisan los permisos que cambian: quitar uno que el actor no tiene sí se puede.
  const before = new Set(role.permissions);
  assertCanGrant(actor, (data.permissions as Permission[]).filter((p) => !before.has(p)));
  if (!data.active && role.active && role._count.users > 0) {
    throw new DomainError(
      `No se puede desactivar: ${role._count.users} usuario(s) activo(s) tienen este rol. Cámbiales el rol primero.`,
    );
  }
  return db.role.update({
    where: { id },
    data: { name: data.name, nameKey: roleNameKey(data.name), permissions: data.permissions, active: data.active },
  });
}

/** Total de permisos del catálogo (para mostrar "12 de 20"). */
export const permissionCount = ALL_PERMISSIONS.length;
