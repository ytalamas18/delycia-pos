import { requireModule } from "@/components/shell/require-module";
import { requirePermission } from "@/core/auth/server";

export default async function CatalogoLayout({ children }: LayoutProps<"/catalogo">) {
  requireModule("catalog");
  await requirePermission("catalog.manage");
  return <div className="space-y-4">{children}</div>;
}
