/**
 * Catálogo de permisos. Es la única fuente: de aquí salen el editor de roles, el menú, `proxy.ts` y
 * `requirePermission()`. Los roles guardan solo las claves en la base.
 *
 * Módulo nuevo → declara aquí sus permisos (clave `<módulo>.<acción>`, pantalla y descripción en español)
 * y, si tiene pantallas, su ruta en `routePermissions`. Aparecen solos en el editor de roles y el Admin
 * los recibe automáticamente.
 */
export const PERMISSIONS = [
  { key: "sales.pos", screen: "Ventas", label: "Ver POS y órdenes", description: "Crear y editar órdenes, enviarlas a cocina e imprimir el ticket." },
  { key: "sales.charge", screen: "Ventas", label: "Cobrar", description: "Cobrar órdenes (incluye dejarlas en cuenta por cobrar)." },
  { key: "sales.discount", screen: "Ventas", label: "Dar descuento", description: "Aplicar un descuento al cobrar." },
  { key: "sales.void", screen: "Ventas", label: "Anular ítems y órdenes", description: "Pide usuario y PIN de quien autoriza, salvo que también tenga “Autorizar anulaciones”." },
  { key: "sales.void.authorize", screen: "Ventas", label: "Autorizar anulaciones", description: "Anula directo y puede autorizar las anulaciones de otros con su usuario y PIN." },
  { key: "sales.history", screen: "Ventas", label: "Ver historial", description: "Órdenes del día y de días anteriores." },
  { key: "sales.credit", screen: "Ventas", label: "Cuentas por cobrar", description: "Ver lo que se debe y registrar abonos." },
  { key: "sales.messageKitchen", screen: "Ventas", label: "Mensajes a cocina", description: "Enviar avisos a la pantalla de cocina." },
  { key: "cash.close", screen: "Caja", label: "Apertura y cierre de caja", description: "Abrir la caja del día y hacer el arqueo de cierre." },
  { key: "kitchen.view", screen: "Cocina", label: "Ver Cocina", description: "Ver la pantalla de comandas." },
  { key: "kitchen.operate", screen: "Cocina", label: "Atender comandas", description: "Cambiar el estado de las comandas y confirmar avisos." },
  { key: "inventory.view", screen: "Inventario", label: "Ver stock y kárdex", description: "Stock actual, alertas de stock bajo y movimientos de cada ítem." },
  { key: "inventory.receive", screen: "Inventario", label: "Ingreso a inventario", description: "Registrar producción propia o ingresos sin compra." },
  { key: "inventory.count", screen: "Inventario", label: "Conteo físico", description: "Ajustar el stock contando lo que hay." },
  { key: "inventory.consume", screen: "Inventario", label: "Salida rápida", description: "Sacar del inventario lo que no se vende (ej. un envase)." },
  { key: "catalog.manage", screen: "Catálogo", label: "Gestionar catálogo", description: "Ítems, precios, recetas, categorías y carga rápida." },
  { key: "purchases.manage", screen: "Compras", label: "Gestionar compras", description: "Proveedores, compras, pagos y cuentas por pagar." },
  { key: "reports.view", screen: "Reportes", label: "Ver reportes", description: "Todos los reportes y sus exportes." },
  { key: "settings.manage", screen: "Ajustes", label: "Cambiar ajustes", description: "% PEYA, tiempos y mensajes de cocina." },
  { key: "users.manage", screen: "Usuarios", label: "Gestionar usuarios y roles", description: "Crear y editar usuarios, roles y permisos; resetear PIN." },
] as const satisfies readonly { key: string; screen: string; label: string; description: string }[];

export type Permission = (typeof PERMISSIONS)[number]["key"];

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS.map((p) => p.key);

const known = new Set<string>(ALL_PERMISSIONS);

export function isPermission(key: string): key is Permission {
  return known.has(key);
}

/** Permisos agrupados por pantalla, en el orden del catálogo (para el editor de roles). */
export function permissionsByScreen() {
  const groups = new Map<string, (typeof PERMISSIONS)[number][]>();
  for (const p of PERMISSIONS) groups.set(p.screen, [...(groups.get(p.screen) ?? []), p]);
  return [...groups].map(([screen, items]) => ({ screen, items }));
}

/**
 * Roles que crea el sistema (migración y seed), con los permisos de los antiguos perfiles fijos.
 * "all" = todo el catálogo, calculado en código: el Admin recibe solo los permisos nuevos.
 */
export const SYSTEM_ROLES = {
  ADMIN: { name: "Admin", permissions: "all" },
  CASHIER: {
    name: "Caja",
    permissions: [
      "sales.pos",
      "sales.charge",
      "sales.discount",
      "sales.void",
      "sales.history",
      "sales.credit",
      "sales.messageKitchen",
      "cash.close",
      "kitchen.view",
      "inventory.consume",
    ],
  },
  KITCHEN: { name: "Cocina", permissions: ["kitchen.view", "kitchen.operate"] },
} as const satisfies Record<string, { name: string; permissions: "all" | readonly Permission[] }>;

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;

/** Permisos efectivos de un rol: el Admin tiene todos; los demás, sus claves que sigan existiendo. */
export function effectivePermissions(role: { systemKey: string | null; permissions: readonly string[] }): Permission[] {
  if (role.systemKey === "ADMIN") return [...ALL_PERMISSIONS];
  return ALL_PERMISSIONS.filter((p) => role.permissions.includes(p));
}

/** Cualquier cosa con permisos (la sesión, un usuario cargado de la base). */
export type PermissionHolder = { permissions: readonly Permission[] };

export function can(holder: PermissionHolder, permission: Permission): boolean {
  return holder.permissions.includes(permission);
}

export function canAny(holder: PermissionHolder, permissions: readonly Permission[]): boolean {
  return permissions.some((p) => can(holder, p));
}

/** Qué permiso exige cada sección de la app (lo usa el proxy). La primera coincidencia gana. */
export const routePermissions: { prefix: string; permission: Permission }[] = [
  { prefix: "/catalogo", permission: "catalog.manage" },
  { prefix: "/ajustes", permission: "settings.manage" },
  { prefix: "/reportes", permission: "reports.view" },
  { prefix: "/compras", permission: "purchases.manage" },
  { prefix: "/usuarios", permission: "users.manage" },
  { prefix: "/inventario/salida", permission: "inventory.consume" },
  { prefix: "/inventario/ingreso", permission: "inventory.receive" },
  { prefix: "/inventario/conteo", permission: "inventory.count" },
  { prefix: "/inventario", permission: "inventory.view" },
  { prefix: "/pos", permission: "sales.pos" },
  { prefix: "/ordenes", permission: "sales.pos" },
  { prefix: "/historial", permission: "sales.history" },
  { prefix: "/cuentas-por-cobrar", permission: "sales.credit" },
  { prefix: "/cierre", permission: "cash.close" },
  { prefix: "/cocina", permission: "kitchen.view" },
];

export function permissionForPath(pathname: string): Permission | null {
  return routePermissions.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`))?.permission ?? null;
}

/** Pantalla sin permisos: a donde va un usuario cuyo rol no le da ninguna pantalla. */
export const NO_ACCESS_PATH = "/sin-acceso";

/** Pantalla de inicio: POS si vende, si no Cocina, si no la primera sección a la que tenga acceso. */
export function homeFor(holder: PermissionHolder): string {
  if (can(holder, "sales.pos")) return "/pos";
  if (can(holder, "kitchen.view")) return "/cocina";
  return routePermissions.find((r) => can(holder, r.permission))?.prefix ?? NO_ACCESS_PATH;
}
