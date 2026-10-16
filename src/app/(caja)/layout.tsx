import { AppNav } from "@/components/shell/app-nav";
import { modules } from "@/config/modules";
import { appConfig } from "@/core/config/app";

export const dynamic = "force-dynamic";

export default function CajaLayout({ children }: LayoutProps<"/">) {
  // TODO(paso 2): tomar el rol del usuario logueado. Por ahora se muestra el menú de caja.
  const items = modules.navFor("CASHIER");
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center gap-4 border-b px-4 py-2">
        <span className="text-xl font-bold text-primary">{appConfig.businessName}</span>
        <AppNav items={items} />
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
