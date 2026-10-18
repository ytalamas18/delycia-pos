import type { ModuleDefinition } from "@/core/modules/types";

/** Reportes: solo lectura, no escucha eventos ni modifica datos de otros módulos. */
export const reportsModule: ModuleDefinition = {
  id: "reports",
  name: "Reportes",
  navItems: [{ label: "Reportes", href: "/reportes" }],
};
