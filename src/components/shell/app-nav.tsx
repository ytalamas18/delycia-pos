"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "@/core/modules/types";
import { cn } from "@/lib/utils";

export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    // Si no entra en una línea (Admin en tablet, o celular), el menú baja a varias filas en vez de cortarse.
    <nav className="flex min-w-0 flex-[1_1_20rem] flex-wrap gap-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded-md px-3 py-2.5 text-base font-medium whitespace-nowrap hover:bg-accent",
            pathname.startsWith(item.href) && "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
