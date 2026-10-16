import { describe, expect, it } from "vitest";

import { createModuleRegistry } from "@/core/modules/registry";
import type { ModuleDefinition } from "@/core/modules/types";

const sales: ModuleDefinition = {
  id: "sales",
  name: "Ventas",
  navItems: [{ label: "Vender", href: "/pos", roles: ["CASHIER"] }],
};
const kitchen: ModuleDefinition = {
  id: "kitchen",
  name: "Cocina",
  navItems: [{ label: "Cocina", href: "/cocina", roles: ["CASHIER", "KITCHEN"] }],
};

describe("registro de módulos", () => {
  it("solo expone módulos activos y filtra el menú por rol", () => {
    const registry = createModuleRegistry([
      { definition: sales, enabled: true },
      { definition: kitchen, enabled: false },
    ]);
    expect(registry.isEnabled("sales")).toBe(true);
    expect(registry.isEnabled("kitchen")).toBe(false);
    expect(registry.navFor("CASHIER").map((i) => i.href)).toEqual(["/pos"]);
    expect(registry.navFor("KITCHEN")).toEqual([]);
  });
});
