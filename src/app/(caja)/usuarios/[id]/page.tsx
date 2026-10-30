import Link from "next/link";
import { notFound } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/core/auth/server";
import { assignableRoles, getUser, PinResetForm, UserForm } from "@/modules/users";

export default async function UsuarioPage({ params }: PageProps<"/usuarios/[id]">) {
  const session = await requirePermission("users.manage");
  const { id } = await params;
  const [user, roles] = await Promise.all([getUser(id), assignableRoles(session)]);
  if (!user) notFound();
  const protectedAdmin = user.role.systemKey === "ADMIN" && !session.isAdmin;

  return (
    <>
      <Link href="/usuarios" className="text-sm text-muted-foreground hover:underline">
        ← Volver a usuarios
      </Link>
      <h1 className="text-2xl font-bold">{user.name}</h1>
      {protectedAdmin ? (
        <p>Este usuario es Admin: solo otro Admin puede editarlo o cambiar su PIN.</p>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Datos y rol</CardTitle>
            </CardHeader>
            <CardContent>
              <UserForm
                roles={roles.map((r) => ({ id: r.id, name: r.name }))}
                user={{ id: user.id, name: user.name, username: user.username, roleId: user.roleId, active: user.active }}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Resetear PIN</CardTitle>
              <CardDescription>Confirma con tu propio PIN.</CardDescription>
            </CardHeader>
            <CardContent>
              <PinResetForm userId={user.id} />
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
