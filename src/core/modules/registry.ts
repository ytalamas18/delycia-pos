import { can, permissionForPath, type PermissionHolder } from "../auth/permissions";
import type { ModuleDefinition, NavItem } from "./types";

export type ModuleEntry = { definition: ModuleDefinition; enabled: boolean };

/** Lógica del registro, sin saber qué módulos existen (eso lo decide src/config/modules.ts). */
export function createModuleRegistry(entries: ModuleEntry[]) {
  const enabled = entries.filter((e) => e.enabled).map((e) => e.definition);

  return {
    enabledModules: () => enabled,
    isEnabled: (id: string) => enabled.some((m) => m.id === id),
    navFor: (user: PermissionHolder): NavItem[] =>
      enabled
        .flatMap((m) => m.navItems)
        .filter((item) => {
          const permission = permissionForPath(item.href);
          return permission === null || can(user, permission);
        }),
    registerAllSubscribers: () => {
      for (const m of enabled) m.registerSubscribers?.();
    },
  };
}
