import type { Role } from "@/generated/prisma/enums";

export type { Role };

/**
 * Permisos por perfil. Hoy hay 3 perfiles fijos; cuando se necesiten roles a medida,
 * este mapa pasa a la base de datos sin cambiar a quien llama a `can()`.
 */
const permissions = {
  "sales.sell": ["ADMIN", "CASHIER"],
  "cash.close": ["ADMIN", "CASHIER"],
  "catalog.manage": ["ADMIN"],
  "settings.manage": ["ADMIN"],
  "kitchen.view": ["ADMIN", "CASHIER", "KITCHEN"],
  "kitchen.operate": ["ADMIN", "KITCHEN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof permissions;

export function can(role: Role, permission: Permission): boolean {
  return (permissions[permission] as readonly Role[]).includes(role);
}

/** Qué permiso exige cada sección de la app (lo usa el proxy). La primera coincidencia gana. */
export const routePermissions: { prefix: string; permission: Permission }[] = [
  { prefix: "/catalogo", permission: "catalog.manage" },
  { prefix: "/ajustes", permission: "settings.manage" },
  { prefix: "/pos", permission: "sales.sell" },
  { prefix: "/ordenes", permission: "sales.sell" },
  { prefix: "/historial", permission: "sales.sell" },
  { prefix: "/cuentas-por-cobrar", permission: "sales.sell" },
  { prefix: "/cierre", permission: "cash.close" },
  { prefix: "/cocina", permission: "kitchen.view" },
];

export function permissionForPath(pathname: string): Permission | null {
  return routePermissions.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`))?.permission ?? null;
}

/** Pantalla de inicio según el perfil. */
export function homeFor(role: Role): string {
  return role === "KITCHEN" ? "/cocina" : "/pos";
}
