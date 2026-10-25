import Link from "next/link";

import { cn } from "@/lib/utils";

const tabs = [
  { href: "/catalogo", label: "Productos" },
  { href: "/catalogo/categorias", label: "Categorías" },
  { href: "/catalogo/carga-rapida", label: "Carga rápida" },
] as const;

export function CatalogTabs({ active }: { active: (typeof tabs)[number]["href"] }) {
  return (
    <div className="flex gap-2 border-b">
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
