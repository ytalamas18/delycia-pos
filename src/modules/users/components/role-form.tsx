"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FieldError, FormStatus } from "@/components/ui/form-status";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SwitchField } from "@/components/ui/switch-field";
import { initialActionResult } from "@/core/actions/types";
import { permissionsByScreen } from "@/core/auth/permissions";

import { createRoleAction, updateRoleAction } from "../actions";

type Role = { id: string; name: string; isAdmin: boolean; active: boolean; permissions: string[] };

const groups = permissionsByScreen();

/**
 * Nombre + permisos agrupados por pantalla (salen del catálogo de core/auth/permissions: un permiso nuevo
 * aparece aquí solo). El rol Admin se muestra con todo marcado y no se puede cambiar.
 */
export function RoleForm({ role }: { role?: Role }) {
  const [state, action, pending] = useActionState(role ? updateRoleAction : createRoleAction, initialActionResult);
  const locked = role?.isAdmin ?? false;

  return (
    <form action={action} className="max-w-4xl space-y-4">
      <input type="hidden" name="id" value={role?.id ?? ""} />
      <div className="grid max-w-sm gap-1">
        <Label htmlFor="name">Nombre del rol</Label>
        <Input id="name" name="name" defaultValue={role?.name} placeholder="Ej. Mesero" required />
        <FieldError state={state} name="name" />
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">Permisos</legend>
        {locked && (
          <p className="text-sm text-muted-foreground">El rol Admin tiene siempre todos los permisos, incluidos los que se agreguen en el futuro.</p>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {groups.map((g) => (
            <div key={g.screen} className="rounded-lg border p-3">
              <h3 className="mb-2 font-semibold">{g.screen}</h3>
              <div className="space-y-2">
                {g.items.map((p) => (
                  <label key={p.key} className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      name="permissions"
                      value={p.key}
                      defaultChecked={locked || (role?.permissions.includes(p.key) ?? false)}
                      disabled={locked}
                      className="mt-0.5 size-5 shrink-0 accent-(--primary)"
                    />
                    <span>
                      <span className="block font-medium">{p.label}</span>
                      <span className="block text-sm text-muted-foreground">{p.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      {role && !locked && (
        <>
          <input type="hidden" name="active" value="off" />
          <SwitchField
            name="active"
            value="on"
            defaultChecked={role.active}
            label="Activo"
            hint="Un rol inactivo no se puede asignar. Solo se desactiva si ningún usuario activo lo tiene."
            className="max-w-xl"
          />
        </>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {role ? "Guardar" : "Crear rol"}
        </Button>
        <FormStatus state={state} />
      </div>
    </form>
  );
}
