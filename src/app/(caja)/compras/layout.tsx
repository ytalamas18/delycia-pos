import { requireModule } from "@/components/shell/require-module";
import { requirePermission } from "@/core/auth/server";

export default async function ComprasLayout({ children }: LayoutProps<"/compras">) {
  requireModule("purchases");
  await requirePermission("purchases.manage");
  return <div className="max-w-6xl space-y-4">{children}</div>;
}
