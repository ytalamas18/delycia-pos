import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ALL_PERMISSIONS,
  can,
  effectivePermissions,
  homeFor,
  permissionForPath,
  permissionsByScreen,
  SYSTEM_ROLES,
  type Permission,
} from "@/core/auth/permissions";
import { cookieSecure, createSessionToken, readSessionToken } from "@/core/auth/session";

const holder = (permissions: Permission[]) => ({ permissions });
const admin = holder(effectivePermissions({ systemKey: "ADMIN", permissions: [] }));
const caja = holder(effectivePermissions({ systemKey: "CASHIER", permissions: [...SYSTEM_ROLES.CASHIER.permissions] }));
const cocina = holder(effectivePermissions({ systemKey: "KITCHEN", permissions: [...SYSTEM_ROLES.KITCHEN.permissions] }));

describe("permisos por rol", () => {
  it("Admin tiene todo el catálogo, aunque su lista guardada esté vacía", () => {
    expect(admin.permissions).toEqual(ALL_PERMISSIONS);
    expect(can(admin, "users.manage")).toBe(true);
  });

  it("Caja vende y ve Cocina, pero no gestiona ni autoriza anulaciones", () => {
    for (const p of ["sales.pos", "sales.charge", "sales.discount", "sales.void", "cash.close", "inventory.consume", "kitchen.view"] as const) {
      expect(can(caja, p)).toBe(true);
    }
    for (const p of ["sales.void.authorize", "catalog.manage", "reports.view", "users.manage", "kitchen.operate", "inventory.view"] as const) {
      expect(can(caja, p)).toBe(false);
    }
  });

  it("Cocina solo ve y atiende Cocina", () => {
    expect(cocina.permissions).toEqual(["kitchen.view", "kitchen.operate"]);
    expect(homeFor(cocina)).toBe("/cocina");
  });

  it("ignora claves guardadas que ya no existen en el catálogo", () => {
    expect(effectivePermissions({ systemKey: null, permissions: ["sales.pos", "sales.sell", "x.y"] })).toEqual(["sales.pos"]);
  });

  it("pantalla de inicio según permisos", () => {
    expect(homeFor(caja)).toBe("/pos");
    expect(homeFor(holder(["reports.view"]))).toBe("/reportes");
    expect(homeFor(holder(["inventory.consume"]))).toBe("/inventario/salida");
    expect(homeFor(holder([]))).toBe("/sin-acceso");
  });

  it("mapea rutas a permisos sin confundir prefijos", () => {
    expect(permissionForPath("/catalogo/productos/1")).toBe("catalog.manage");
    expect(permissionForPath("/inventario/salida")).toBe("inventory.consume");
    expect(permissionForPath("/inventario/abc")).toBe("inventory.view");
    expect(permissionForPath("/usuarios/roles/1")).toBe("users.manage");
    expect(permissionForPath("/posxyz")).toBeNull();
    expect(permissionForPath("/login")).toBeNull();
  });

  it("el catálogo no repite claves y agrupa por pantalla", () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    const groups = permissionsByScreen();
    expect(groups.map((g) => g.screen)).toContain("Ventas");
    expect(groups.flatMap((g) => g.items).length).toBe(ALL_PERMISSIONS.length);
  });

  it("la migración crea Caja y Cocina con los mismos permisos que SYSTEM_ROLES", () => {
    const dir = path.join(__dirname, "../../prisma/migrations/20261030120000_usuarios_y_roles/migration.sql");
    const sql = readFileSync(dir, "utf8");
    const arrayFor = (id: string) => {
      const m = sql.match(new RegExp(`'${id}'[^]*?ARRAY\\[([^\\]]*)\\]`));
      return [...(m?.[1] ?? "").matchAll(/'([^']+)'/g)].map((x) => x[1]);
    };
    expect(arrayFor("role_cashier")).toEqual(SYSTEM_ROLES.CASHIER.permissions);
    expect(arrayFor("role_kitchen")).toEqual(SYSTEM_ROLES.KITCHEN.permissions);
  });
});

describe("sesión firmada", () => {
  it("lee lo que firmó y rechaza tokens alterados o del formato anterior", async () => {
    const token = await createSessionToken({ userId: "u1", sessionVersion: 2 });
    expect(await readSessionToken(token)).toEqual({ userId: "u1", sessionVersion: 2 });

    const [header, , signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "u2", sv: 2 })).toString("base64url");
    expect(await readSessionToken(`${header}.${forged}.${signature}`)).toBeNull();
    expect(await readSessionToken(undefined)).toBeNull();
  });
});

describe("cookie Secure", () => {
  it("solo con HTTPS: COOKIE_SECURE manda y si falta se deduce de APP_URL", () => {
    expect(cookieSecure({})).toBe(false);
    expect(cookieSecure({ APP_URL: "http://54.232.10.20" })).toBe(false);
    expect(cookieSecure({ APP_URL: "https://pos.delycia.com" })).toBe(true);
    expect(cookieSecure({ APP_URL: "https://pos.delycia.com", COOKIE_SECURE: "false" })).toBe(false);
    expect(cookieSecure({ APP_URL: "http://54.232.10.20", COOKIE_SECURE: "true" })).toBe(true);
  });
});
