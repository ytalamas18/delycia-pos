import { requireModule } from "@/components/shell/require-module";

export default function InventarioLayout({ children }: LayoutProps<"/inventario">) {
  requireModule("inventory");
  return <div className="max-w-6xl space-y-4">{children}</div>;
}
