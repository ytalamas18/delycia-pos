"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "@/core/modules/types";
import { cn } from "@/lib/utils";

export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded-md px-4 py-2.5 text-base font-medium whitespace-nowrap hover:bg-accent",
            pathname.startsWith(item.href) && "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
