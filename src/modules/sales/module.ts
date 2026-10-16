import type { ModuleDefinition } from "@/core/modules/types";

export const salesModule: ModuleDefinition = {
  id: "sales",
  name: "Ventas",
  navItems: [
    { label: "Vender", href: "/pos", roles: ["ADMIN", "CASHIER"] },
    { label: "Órdenes abiertas", href: "/ordenes", roles: ["ADMIN", "CASHIER"] },
    { label: "Historial", href: "/historial", roles: ["ADMIN", "CASHIER"] },
  ],
};
