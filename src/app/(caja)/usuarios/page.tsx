import { Pencil } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/core/auth/server";
import { assignableRoles, listUsers, UserForm, UsersNav } from "@/modules/users";

export default async function UsuariosPage({ searchParams }: PageProps<"/usuarios">) {
  const session = await requirePermission("users.manage");
  const [users, roles, { creado }] = await Promise.all([listUsers(), assignableRoles(session), searchParams]);
  const created = typeof creado === "string" ? users.find((u) => u.id === creado) : undefined;

  return (
    <>
      <h1 className="text-2xl font-bold">Usuarios</h1>
      <UsersNav active="/usuarios" />
      {created && (
        <p role="status" className="font-medium text-green-700 dark:text-green-400">
          Usuario {created.name} creado: entra con «{created.username}» y su PIN.
        </p>
      )}
      <ul className="divide-y rounded-lg border">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 font-medium">
                {u.name}
                {u.id === session.userId && <Badge variant="secondary">Tú</Badge>}
                {!u.active && <Badge variant="secondary">Inactivo</Badge>}
                {u.locked && <Badge className="bg-yellow-300 text-black">Bloqueado por intentos</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                {u.username} · {u.role.name}
                {!u.role.active && " (rol desactivado)"}
              </div>
            </div>
            <Button asChild variant="outline" size="icon" aria-label={`Editar ${u.name}`}>
              <Link href={`/usuarios/${u.id}`}>
                <Pencil />
              </Link>
            </Button>
          </li>
        ))}
      </ul>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <UserForm roles={roles.map((r) => ({ id: r.id, name: r.name }))} />
        </CardContent>
      </Card>
    </>
  );
}
