import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { authenticate, loadSessionUser } from "@/core/auth/service";
import type { SessionUser } from "@/core/auth/session";
import { db, disconnectDb } from "@/core/db/client";
import * as roles from "@/modules/users/services/roles";
import * as users from "@/modules/users/services/users";

import { seed } from "../../prisma/seed-data";
import { resetDatabase } from "../support/db";

const PINS = { Admin: "4817", Caja: "5930", Cocina: "6271" };

async function sessionOf(username: string): Promise<SessionUser> {
  const u = await db.user.findUniqueOrThrow({ where: { username } });
  const s = await loadSessionUser({ userId: u.id, sessionVersion: u.sessionVersion });
  if (!s) throw new Error(`sin sesión para ${username}`);
  return s;
}

const roleId = (systemKey: string) => db.role.findUniqueOrThrow({ where: { systemKey } }).then((r) => r.id);

beforeEach(async () => {
  await resetDatabase();
  await seed(db, PINS, { menu: false });
});
afterAll(disconnectDb);

describe("roles", () => {
  it("crea un rol con permisos del catálogo (descarta claves desconocidas) y nombre único sin mayúsculas", async () => {
    const admin = await sessionOf("admin");
    const mesero = await roles.createRole({ name: "Mesero", permissions: ["sales.pos", "inventado.x", "sales.pos"] }, admin);
    expect(mesero.permissions).toEqual(["sales.pos"]);
    await expect(roles.createRole({ name: "  MESERO ", permissions: [] }, admin)).rejects.toMatchObject({ code: "P2002" });
  });

  it("el rol Admin no pierde permisos ni se desactiva; sí se puede renombrar", async () => {
    const admin = await sessionOf("admin");
    const id = await roleId("ADMIN");
    await expect(roles.updateRole(id, { name: "Admin", permissions: [], active: false }, admin)).rejects.toThrow(/no se puede desactivar/);
    await roles.updateRole(id, { name: "Dueño", permissions: ["sales.pos"], active: true }, admin);
    const role = await roles.getRole(id);
    expect(role).toMatchObject({ name: "Dueño", isAdmin: true, active: true });
    expect(role!.permissions).toContain("users.manage");
    expect((await sessionOf("admin")).permissions).toContain("reports.view");
  });

  it("no se desactiva un rol con usuarios activos", async () => {
    const admin = await sessionOf("admin");
    await expect(roles.updateRole(await roleId("KITCHEN"), { name: "Cocina", permissions: ["kitchen.view"], active: false }, admin)).rejects.toThrow(
      /usuario\(s\) activo/,
    );
  });

  it("quien no es Admin solo da permisos que tiene", async () => {
    const admin = await sessionOf("admin");
    const encargado = await roles.createRole({ name: "Encargado", permissions: ["users.manage", "sales.pos"] }, admin);
    await users.createUser({ name: "Eva", username: "eva", roleId: encargado.id, newPin: "4829", confirmPin: "4829" }, admin);
    const eva = await sessionOf("eva");
    await expect(roles.createRole({ name: "Súper", permissions: ["reports.view"] }, eva)).rejects.toThrow(/Solo puedes dar permisos/);
    await expect(roles.createRole({ name: "Mesero", permissions: ["sales.pos"] }, eva)).resolves.toBeTruthy();
    await expect(roles.updateRole(await roleId("ADMIN"), { name: "Jefe", permissions: [], active: true }, eva)).rejects.toThrow(/Solo un Admin/);
  });
});

describe("usuarios", () => {
  it("crea con usuario en minúsculas, rechaza duplicados y PIN débiles", async () => {
    const admin = await sessionOf("admin");
    const cashier = await roleId("CASHIER");
    const u = await users.createUser({ name: "Luis Rojas", username: " Luis.R ", roleId: cashier, newPin: "4829", confirmPin: "4829" }, admin);
    expect(u.username).toBe("luis.r");
    expect((await authenticate("LUIS.R", "4829")).ok).toBe(true);
    await expect(
      users.createUser({ name: "Otro", username: "luis.r", roleId: cashier, newPin: "4829", confirmPin: "4829" }, admin),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      users.createUser({ name: "Ana", username: "ana", roleId: cashier, newPin: "1234", confirmPin: "1234" }, admin),
    ).rejects.toThrow(/muy fácil/);
    await expect(users.createUser({ name: "Ana", username: "a b", roleId: cashier, newPin: "4829", confirmPin: "4829" }, admin)).rejects.toThrow();
  });

  it("siempre queda un Admin activo y nadie se desactiva ni se quita el Admin a sí mismo", async () => {
    const admin = await sessionOf("admin");
    const adminRole = await roleId("ADMIN");
    const cashier = await roleId("CASHIER");
    const base = { name: "Admin", username: "admin" };
    await expect(users.updateUser(admin.userId, { ...base, roleId: adminRole, active: false }, admin)).rejects.toThrow(/desactivarte a ti mismo/);
    await expect(users.updateUser(admin.userId, { ...base, roleId: cashier, active: true }, admin)).rejects.toThrow(/quitarte el rol Admin/);

    // Con un segundo Admin, uno puede bajar al otro; al último no.
    const otro = await users.createUser({ name: "Rosa", username: "rosa", roleId: adminRole, newPin: "4829", confirmPin: "4829" }, admin);
    const rosa = await sessionOf("rosa");
    await users.updateUser(admin.userId, { ...base, roleId: cashier, active: true }, rosa);
    expect((await sessionOf("admin")).isAdmin).toBe(false);
    // Rosa es la única Admin: Admin (ahora Caja) no puede tocarla, y ella no se puede quitar el rol.
    await expect(users.updateUser(otro.id, { name: "Rosa", username: "rosa", roleId: cashier, active: true }, rosa)).rejects.toThrow(
      /quitarte el rol Admin/,
    );
    expect(await db.user.count({ where: { active: true, role: { systemKey: "ADMIN" } } })).toBe(1);
  });

  it("solo un Admin da el rol Admin o edita a un Admin", async () => {
    const admin = await sessionOf("admin");
    const encargado = await roles.createRole({ name: "Encargado", permissions: ["users.manage"] }, admin);
    await users.createUser({ name: "Eva", username: "eva", roleId: encargado.id, newPin: "4829", confirmPin: "4829" }, admin);
    const eva = await sessionOf("eva");
    const caja = await sessionOf("caja");
    await expect(users.updateUser(caja.userId, { name: "Caja", username: "caja", roleId: await roleId("ADMIN"), active: true }, eva)).rejects.toThrow(
      /Solo un Admin puede dar el rol Admin/,
    );
    await expect(users.updateUser(admin.userId, { name: "Admin", username: "admin", roleId: await roleId("ADMIN"), active: true }, eva)).rejects.toThrow(
      /Solo un Admin puede editar/,
    );
    await expect(users.resetPin({ userId: admin.userId, newPin: "3816", confirmPin: "3816", actorPin: "4829" }, eva)).rejects.toThrow(/Solo un Admin/);
    expect(await users.assignableRoles(eva)).not.toContainEqual(expect.objectContaining({ systemKey: "ADMIN" }));
  });
});

describe("la sesión refleja los cambios al instante", () => {
  it("desactivar al usuario invalida su sesión", async () => {
    const admin = await sessionOf("admin");
    const caja = await db.user.findUniqueOrThrow({ where: { username: "caja" } });
    const claims = { userId: caja.id, sessionVersion: caja.sessionVersion };
    expect(await loadSessionUser(claims)).not.toBeNull();
    await users.updateUser(caja.id, { name: "Caja", username: "caja", roleId: caja.roleId, active: false }, admin);
    expect(await loadSessionUser(claims)).toBeNull();
    expect((await authenticate("caja", PINS.Caja)).ok).toBe(false);
  });

  it("cambiar el rol o los permisos del rol cambia los permisos de la sesión abierta", async () => {
    const admin = await sessionOf("admin");
    const caja = await db.user.findUniqueOrThrow({ where: { username: "caja" } });
    const claims = { userId: caja.id, sessionVersion: caja.sessionVersion };
    expect((await loadSessionUser(claims))!.permissions).toContain("sales.charge");

    const mesero = await roles.createRole({ name: "Mesero", permissions: ["sales.pos"] }, admin);
    await users.updateUser(caja.id, { name: "Caja", username: "caja", roleId: mesero.id, active: true }, admin);
    expect((await loadSessionUser(claims))!.permissions).toEqual(["sales.pos"]);

    await roles.updateRole(mesero.id, { name: "Mesero", permissions: ["sales.pos", "sales.charge"], active: true }, admin);
    expect((await loadSessionUser(claims))!.permissions).toEqual(["sales.pos", "sales.charge"]);
  });

  it("resetear el PIN cierra las sesiones abiertas, desbloquea y exige el PIN de quien lo hace", async () => {
    const admin = await sessionOf("admin");
    const caja = await db.user.findUniqueOrThrow({ where: { username: "caja" } });
    const claims = { userId: caja.id, sessionVersion: caja.sessionVersion };
    for (let i = 0; i < 5; i++) await authenticate("caja", "0001");
    expect((await authenticate("caja", PINS.Caja)).ok).toBe(false);

    await expect(users.resetPin({ userId: caja.id, newPin: "3816", confirmPin: "3816", actorPin: "9999" }, admin)).rejects.toThrow(/Tu PIN/);
    await expect(users.resetPin({ userId: caja.id, newPin: "3816", confirmPin: "3817", actorPin: PINS.Admin }, admin)).rejects.toThrow(
      /no coinciden/,
    );
    const r = await users.resetPin({ userId: caja.id, newPin: "3816", confirmPin: "3816", actorPin: PINS.Admin }, admin);
    expect(r).toMatchObject({ name: "Caja", self: false });

    expect(await loadSessionUser(claims)).toBeNull();
    expect((await authenticate("caja", PINS.Caja)).ok).toBe(false);
    expect(await authenticate("caja", "3816")).toMatchObject({ ok: true, sessionVersion: claims.sessionVersion + 1 });
  });
});
