import { createModuleRegistry } from "@/core/modules/registry";
import { catalogModule } from "@/modules/catalog";
import { kitchenModule } from "@/modules/kitchen";
import { salesModule } from "@/modules/sales";

/**
 * Raíz de composición: aquí se decide qué módulos están activos.
 * Para apagar un módulo, pon `enabled: false` (desaparece del menú y sus eventos no se escuchan).
 * A futuro: { definition: reportsModule, enabled: true }
 */
export const modules = createModuleRegistry([
  { definition: catalogModule, enabled: true },
  { definition: salesModule, enabled: true },
  { definition: kitchenModule, enabled: true },
]);
