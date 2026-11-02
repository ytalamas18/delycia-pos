import type { ModuleDefinition } from "@/core/modules/types";

/** Caja y bancos: retiros de efectivo, traspasos entre cuentas, saldos iniciales y el libro (pantalla). */
export const treasuryModule: ModuleDefinition = {
  id: "treasury",
  name: "Caja y bancos",
  navItems: [{ label: "Caja y bancos", href: "/caja-bancos" }],
};
