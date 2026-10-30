"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { type ActionResult, toActionResult } from "@/core/actions/result";
import { requirePermission, setSessionCookie } from "@/core/auth/server";
import { createSessionToken } from "@/core/auth/session";

import * as roles from "./services/roles";
import * as users from "./services/users";

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "");
// Al editar llega "off" (oculto) y, si está marcado, también "on".
const checked = (fd: FormData, key: string) => fd.getAll(key).length === 0 || fd.getAll(key).includes("on");

function refresh() {
  revalidatePath("/usuarios", "layout");
}

// --- Usuarios ---

export async function createUserAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("users.manage");
  let id: string | null = null;
  const result = await toActionResult(
    async () => {
      const user = await users.createUser(
        {
          name: text(fd, "name"),
          username: text(fd, "username"),
          roleId: text(fd, "roleId"),
          newPin: text(fd, "newPin"),
          confirmPin: text(fd, "confirmPin"),
        },
        session,
      );
      id = user.id;
      refresh();
    },
    { duplicate: "Ese nombre de usuario ya existe." },
  );
  if (id) redirect(`/usuarios?creado=${id}`);
  return result;
}

export async function updateUserAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("users.manage");
  return toActionResult(
    async () => {
      await users.updateUser(
        text(fd, "id"),
        { name: text(fd, "name"), username: text(fd, "username"), roleId: text(fd, "roleId"), active: checked(fd, "active") },
        session,
      );
      refresh();
      return "Usuario guardado";
    },
    { duplicate: "Ese nombre de usuario ya existe." },
  );
}

export async function resetPinAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("users.manage");
  return toActionResult(async () => {
    const r = await users.resetPin(
      {
        userId: text(fd, "userId"),
        newPin: text(fd, "newPin"),
        confirmPin: text(fd, "confirmPin"),
        actorPin: text(fd, "actorPin"),
      },
      session,
    );
    // Resetear el PIN cierra las sesiones de ese usuario; si es el propio, se renueva la cookie de este aparato.
    if (r.self) await setSessionCookie(await createSessionToken({ userId: session.userId, sessionVersion: r.sessionVersion }));
    refresh();
    return `PIN de ${r.name} cambiado${r.self ? "" : ": sus sesiones abiertas se cerraron"}`;
  });
}

// --- Roles ---

function roleFromForm(fd: FormData) {
  return { name: text(fd, "name"), permissions: fd.getAll("permissions").map(String), active: checked(fd, "active") };
}

export async function createRoleAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("users.manage");
  let id: string | null = null;
  const result = await toActionResult(
    async () => {
      id = (await roles.createRole(roleFromForm(fd), session)).id;
      refresh();
    },
    { duplicate: "Ya existe un rol con ese nombre." },
  );
  if (id) redirect(`/usuarios/roles/${id}?creado=1`);
  return result;
}

export async function updateRoleAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const session = await requirePermission("users.manage");
  return toActionResult(
    async () => {
      await roles.updateRole(text(fd, "id"), roleFromForm(fd), session);
      refresh();
      return "Rol guardado";
    },
    { duplicate: "Ya existe un rol con ese nombre." },
  );
}
