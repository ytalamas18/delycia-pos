import type { ModuleDefinition } from "@/core/modules/types";

import { registerKitchenSubscribers } from "./subscribers";

export const kitchenModule: ModuleDefinition = {
  id: "kitchen",
  name: "Cocina",
  navItems: [{ label: "Cocina", href: "/cocina" }],
  registerSubscribers: registerKitchenSubscribers,
};
