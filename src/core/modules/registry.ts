import type { ModuleDefinition, NavItem, Role } from "./types";

export type ModuleEntry = { definition: ModuleDefinition; enabled: boolean };

/** Lógica del registro, sin saber qué módulos existen (eso lo decide src/config/modules.ts). */
export function createModuleRegistry(entries: ModuleEntry[]) {
  const enabled = entries.filter((e) => e.enabled).map((e) => e.definition);

  return {
    enabledModules: () => enabled,
    isEnabled: (id: string) => enabled.some((m) => m.id === id),
    navFor: (role: Role): NavItem[] =>
      enabled.flatMap((m) => m.navItems).filter((item) => item.roles.includes(role)),
    registerAllSubscribers: () => {
      for (const m of enabled) m.registerSubscribers?.();
    },
  };
}
