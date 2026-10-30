"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SwitchField } from "@/components/ui/switch-field";
import { initialActionResult } from "@/core/actions/types";

import { createUserAction, updateUserAction } from "../actions";
import { pinInputProps } from "./pin-input";

type RoleOption = { id: string; name: string };
type User = { id: string; name: string; username: string; roleId: string; active: boolean };

/** Alta (con PIN inicial) o edición (sin PIN: se resetea aparte) de un usuario. */
export function UserForm({ roles, user }: { roles: RoleOption[]; user?: User }) {
  const [state, action, pending] = useActionState(user ? updateUserAction : createUserAction, initialActionResult);
  // Si el rol actual ya no es asignable (desactivado o Admin para quien no es Admin) se muestra igual.
  const currentMissing = user && !roles.some((r) => r.id === user.roleId);

  return (
    <form action={action} className="grid max-w-2xl gap-3 sm:grid-cols-2">
      <input type="hidden" name="id" value={user?.id ?? ""} />
      <div className="grid gap-1">
        <Label htmlFor="name">Nombre completo</Label>
        <Input id="name" name="name" defaultValue={user?.name} placeholder="Ej. María Pérez" required />
        <FieldError state={state} name="name" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="username">Nombre de usuario</Label>
        <Input
          id="username"
          name="username"
          defaultValue={user?.username}
          placeholder="Ej. maria"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          required
        />
        <FieldError state={state} name="username" />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="roleId">Rol</Label>
        <select
          id="roleId"
          name="roleId"
          defaultValue={user?.roleId ?? ""}
          required
          className="h-11 rounded-md border border-input bg-background px-3 text-base"
        >
          {!user && (
            <option value="" disabled>
              Elige un rol
            </option>
          )}
          {currentMissing && <option value={user.roleId}>(rol actual)</option>}
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <FieldError state={state} name="roleId" />
      </div>
      {!user && (
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1">
            <Label htmlFor="newPin">PIN inicial</Label>
            <Input id="newPin" name="newPin" {...pinInputProps} />
            <FieldError state={state} name="newPin" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="confirmPin">Repetir PIN</Label>
            <Input id="confirmPin" name="confirmPin" {...pinInputProps} />
            <FieldError state={state} name="confirmPin" />
          </div>
        </div>
      )}
      {user && (
        <>
          <input type="hidden" name="active" value="off" />
          <SwitchField
            name="active"
            value="on"
            defaultChecked={user.active}
            label="Activo"
            hint="Un usuario inactivo no puede entrar (si tiene una sesión abierta, se cierra). Nunca se borra: las ventas guardan quién las hizo."
            className="sm:col-span-2"
          />
          <FieldError state={state} name="active" />
        </>
      )}
      <div className="flex items-center gap-3 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {user ? "Guardar" : "Crear usuario"}
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
