import { describe, expect, it } from "vitest";

import { matchesSearch } from "@/components/ui/search-select";

describe("buscador de ítems", () => {
  const caja = { value: "1", label: "CAJA CHINA Y SOPA", hint: "unidad" };
  it("sin mayúsculas, sin tildes y con las palabras en cualquier orden", () => {
    expect(matchesSearch(caja, "caja")).toBe(true);
    expect(matchesSearch(caja, "sopa caja")).toBe(true);
    expect(matchesSearch({ value: "2", label: "Azúcar" }, "azucar")).toBe(true);
    expect(matchesSearch({ value: "3", label: "Cebolla" }, "CEBÓLLA")).toBe(true);
  });
  it("todas las palabras tienen que estar; vacío muestra todo; busca también en el detalle", () => {
    expect(matchesSearch(caja, "caja pollo")).toBe(false);
    expect(matchesSearch(caja, "   ")).toBe(true);
    expect(matchesSearch({ value: "4", label: "Carne molida", hint: "kg" }, "carne kg")).toBe(true);
  });
});
