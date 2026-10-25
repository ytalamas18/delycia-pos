import Link from "next/link";

import { cn } from "@/lib/utils";

const tabs = [
  { href: "/inventario", label: "Stock" },
  { href: "/inventario/ingreso", label: "Ingreso a inventario" },
  { href: "/inventario/conteo", label: "Conteo físico" },
  { href: "/inventario/salida", label: "Salida rápida" },
];

export function InventoryNav({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap gap-2 border-b">
      {tabs.map((t) => (
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
