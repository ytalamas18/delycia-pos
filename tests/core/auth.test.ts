import { describe, expect, it } from "vitest";

import { can, homeFor, permissionForPath } from "@/core/auth/permissions";
import { createSessionToken, readSessionToken } from "@/core/auth/session";

describe("permisos", () => {
  it("solo Admin gestiona catálogo y ajustes", () => {
    expect(can("ADMIN", "catalog.manage")).toBe(true);
    expect(can("CASHIER", "catalog.manage")).toBe(false);
    expect(can("KITCHEN", "settings.manage")).toBe(false);
  });

  it("cocina no entra a ventas", () => {
    expect(can("KITCHEN", "sales.sell")).toBe(false);
    expect(homeFor("KITCHEN")).toBe("/cocina");
  });

  it("mapea rutas a permisos sin confundir prefijos", () => {
    expect(permissionForPath("/catalogo/productos/1")).toBe("catalog.manage");
    expect(permissionForPath("/posxyz")).toBeNull();
    expect(permissionForPath("/login")).toBeNull();
  });
});

describe("sesión firmada", () => {
  it("lee lo que firmó y rechaza tokens alterados", async () => {
    const token = await createSessionToken({ userId: "u1", name: "Caja", role: "CASHIER" });
    expect(await readSessionToken(token)).toEqual({ userId: "u1", name: "Caja", role: "CASHIER" });

    const [header, , signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "u1", name: "Caja", role: "ADMIN" })).toString("base64url");
    expect(await readSessionToken(`${header}.${forged}.${signature}`)).toBeNull();
    expect(await readSessionToken(undefined)).toBeNull();
  });
});
