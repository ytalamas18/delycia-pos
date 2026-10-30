import Link from "next/link";
import { notFound } from "next/navigation";

import { getRole, RoleForm } from "@/modules/users";

export default async function RolPage({ params, searchParams }: PageProps<"/usuarios/roles/[id]">) {
  const [{ id }, { creado }] = await Promise.all([params, searchParams]);
  const role = await getRole(id);
  if (!role) notFound();
  return (
    <>
      <Link href="/usuarios/roles" className="text-sm text-muted-foreground hover:underline">
        ← Volver a roles
      </Link>
      <h1 className="text-2xl font-bold">Rol: {role.name}</h1>
      {creado && (
        <p role="status" className="font-medium text-green-700 dark:text-green-400">
          Rol creado. Asígnalo a un usuario desde la pestaña Usuarios.
        </p>
      )}
      <RoleForm
        role={{ id: role.id, name: role.name, isAdmin: role.isAdmin, active: role.active, permissions: role.permissions }}
      />
    </>
  );
}
