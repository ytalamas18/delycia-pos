import type { ModuleDefinition } from "@/core/modules/types";

export const salesModule: ModuleDefinition = {
  id: "sales",
  name: "Ventas",
  navItems: [
    { label: "Vender", href: "/pos" },
    { label: "Por pagar", href: "/ordenes" },
    { label: "Historial", href: "/historial" },
  ],
};
