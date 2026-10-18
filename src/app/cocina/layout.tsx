import { LogOut } from "lucide-react";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/login/actions";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { getSession } from "@/core/auth/server";

export const dynamic = "force-dynamic";

/** El KDS va a pantalla completa, sin el menú de caja. Tema oscuro por defecto (se cambia con ☀️/🌙). */
export default async function CocinaLayout({ children }: LayoutProps<"/cocina">) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background text-foreground">
      <header className="flex items-center justify-end gap-3 px-4 pt-2">
        <ThemeToggle section="cocina" />
        <span className="text-sm text-muted-foreground">{session.name}</span>
        <form action={logoutAction}>
          <Button variant="ghost" size="sm" type="submit">
            <LogOut className="size-4" /> Salir
          </Button>
        </form>
      </header>
      {children}
    </div>
  );
}
