import type { ModuleDefinition } from "@/core/modules/types";

import { registerInventorySubscribers } from "./subscribers";

export const inventoryModule: ModuleDefinition = {
  id: "inventory",
  name: "Inventario",
  navItems: [
    { label: "Inventario", href: "/inventario" },
    { label: "Salida rápida", href: "/inventario/salida" },
  ],
  registerSubscribers: registerInventorySubscribers,
};
