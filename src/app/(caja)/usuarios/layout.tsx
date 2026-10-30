import { requireModule } from "@/components/shell/require-module";
import { requirePermission } from "@/core/auth/server";

export default async function UsuariosLayout({ children }: LayoutProps<"/usuarios">) {
  requireModule("users");
  await requirePermission("users.manage");
  return <div className="max-w-6xl space-y-4">{children}</div>;
}
