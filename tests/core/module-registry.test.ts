import { describe, expect, it } from "vitest";

import { createModuleRegistry } from "@/core/modules/registry";
import type { ModuleDefinition } from "@/core/modules/types";

const sales: ModuleDefinition = {
  id: "sales",
  name: "Ventas",
  navItems: [{ label: "Vender", href: "/pos" }],
};
const kitchen: ModuleDefinition = {
  id: "kitchen",
  name: "Cocina",
  navItems: [{ label: "Cocina", href: "/cocina" }],
};
const catalog: ModuleDefinition = {
  id: "catalog",
  name: "Catálogo",
  navItems: [{ label: "Catálogo", href: "/catalogo" }],
};

describe("registro de módulos", () => {
  it("solo expone módulos activos", () => {
    const registry = createModuleRegistry([
      { definition: sales, enabled: true },
      { definition: kitchen, enabled: false },
    ]);
    expect(registry.isEnabled("sales")).toBe(true);
    expect(registry.isEnabled("kitchen")).toBe(false);
    expect(registry.navFor("ADMIN").map((i) => i.href)).toEqual(["/pos"]);
  });

  it("el menú respeta los mismos permisos que las rutas", () => {
    const registry = createModuleRegistry([
      { definition: sales, enabled: true },
      { definition: kitchen, enabled: true },
      { definition: catalog, enabled: true },
    ]);
    expect(registry.navFor("ADMIN").map((i) => i.href)).toEqual(["/pos", "/cocina", "/catalogo"]);
    expect(registry.navFor("CASHIER").map((i) => i.href)).toEqual(["/pos", "/cocina"]);
    expect(registry.navFor("KITCHEN").map((i) => i.href)).toEqual(["/cocina"]);
  });
});
