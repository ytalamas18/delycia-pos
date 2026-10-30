import Link from "next/link";

import { can, permissionForPath } from "@/core/auth/permissions";
import { getSession } from "@/core/auth/server";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/inventario", label: "Stock" },
  { href: "/inventario/ingreso", label: "Ingreso a inventario" },
  { href: "/inventario/conteo", label: "Conteo físico" },
  { href: "/inventario/salida", label: "Salida rápida" },
];

/** Pestañas de Inventario: solo las que permite el rol (con una sola, no se muestran). */
export async function InventoryNav({ active }: { active: string }) {
  const session = await getSession();
  const visible = tabs.filter((t) => {
    const permission = permissionForPath(t.href);
    return session && (!permission || can(session, permission));
  });
  if (visible.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-2 border-b">
      {visible.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "-mb-px border-b-2 px-4 py-2 text-base font-medium",
            t.href === active ? "border-primary text-primary" : "border-transparent text-muted-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
