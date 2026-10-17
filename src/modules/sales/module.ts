import type { ModuleDefinition } from "@/core/modules/types";

import { registerSalesSubscribers } from "./subscribers";

export const salesModule: ModuleDefinition = {
  id: "sales",
  name: "Ventas",
  navItems: [
    { label: "Vender", href: "/pos" },
    { label: "Por pagar", href: "/ordenes" },
    { label: "Cuentas por cobrar", href: "/cuentas-por-cobrar" },
    { label: "Historial", href: "/historial" },
  ],
  registerSubscribers: registerSalesSubscribers,
};
