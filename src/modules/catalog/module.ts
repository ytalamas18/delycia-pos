import type { ModuleDefinition } from "@/core/modules/types";

export const catalogModule: ModuleDefinition = {
  id: "catalog",
  name: "Catálogo",
  navItems: [{ label: "Catálogo", href: "/catalogo", roles: ["ADMIN", "CASHIER"] }],
};
