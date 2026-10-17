import { createModuleRegistry } from "@/core/modules/registry";
import type { ModuleDefinition } from "@/core/modules/types";
import { catalogModule } from "@/modules/catalog";
import { kitchenModule } from "@/modules/kitchen";
import { salesModule } from "@/modules/sales";

/** Pantalla de ajustes generales: reúne los ajustes que expone cada módulo. */
const settingsModule: ModuleDefinition = {
  id: "settings",
  name: "Ajustes",
  navItems: [{ label: "Ajustes", href: "/ajustes" }],
};

/**
 * Raíz de composición: aquí se decide qué módulos están activos.
 * Para apagar un módulo, pon `enabled: false` (desaparece del menú y sus eventos no se escuchan).
 * A futuro: { definition: reportsModule, enabled: true }
 */
export const modules = createModuleRegistry([
  { definition: salesModule, enabled: true },
  { definition: kitchenModule, enabled: true },
  { definition: catalogModule, enabled: true },
  { definition: settingsModule, enabled: true },
]);
