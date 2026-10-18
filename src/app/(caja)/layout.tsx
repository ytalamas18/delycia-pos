import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/login/actions";
import { AppNav } from "@/components/shell/app-nav";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { modules } from "@/config/modules";
import { appConfig } from "@/core/config/app";
import { can } from "@/core/auth/permissions";
import { getSession } from "@/core/auth/server";
import { getSetting } from "@/core/settings";
import { KitchenMessageButton, quickMessagesSetting } from "@/modules/kitchen";
import { ReadyNotifier } from "@/modules/sales";

export const dynamic = "force-dynamic";

export default async function CajaLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();
  if (!session) redirect("/login");
  const items = modules.navFor(session.role);
  const canMessageKitchen = modules.isEnabled("kitchen") && can(session.role, "sales.sell");
  const quickMessages = canMessageKitchen ? await getSetting(quickMessagesSetting) : [];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center gap-4 border-b px-4 py-2">
        <span className="text-xl font-bold text-primary">{appConfig.businessName}</span>
        <AppNav items={items} />
        <div className="ml-auto flex items-center gap-2">
          {canMessageKitchen && <KitchenMessageButton quickMessages={quickMessages} />}
          <ThemeToggle section="pos" />
          <span className="text-sm text-muted-foreground">{session.name}</span>
          <form action={logoutAction}>
            <Button variant="ghost" size="sm" type="submit">
              <LogOut className="size-4" /> Salir
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
      <ReadyNotifier />
    </div>
  );
}
