import { Pencil } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listRoles, permissionCount, RoleForm, UsersNav } from "@/modules/users";

export default async function RolesPage() {
  const roles = await listRoles();
  return (
    <>
      <h1 className="text-2xl font-bold">Roles y permisos</h1>
      <UsersNav active="/usuarios/roles" />
      <ul className="divide-y rounded-lg border">
        {roles.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 font-medium">
                {r.name}
                {r.systemKey && <Badge variant="secondary">Del sistema</Badge>}
                {!r.active && <Badge variant="secondary">Inactivo</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                {r.isAdmin ? "Todos los permisos" : `${r.permissions.length} de ${permissionCount} permisos`} ·{" "}
                {r.activeUsers} usuario(s) activo(s)
              </div>
            </div>
            <Button asChild variant="outline" size="icon" aria-label={`Editar ${r.name}`}>
              <Link href={`/usuarios/roles/${r.id}`}>
                <Pencil />
              </Link>
            </Button>
          </li>
        ))}
      </ul>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo rol</CardTitle>
        </CardHeader>
        <CardContent>
          <RoleForm />
        </CardContent>
      </Card>
    </>
  );
}
