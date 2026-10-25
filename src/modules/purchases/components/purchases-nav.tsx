import Link from "next/link";

import { cn } from "@/lib/utils";

const tabs = [
  { href: "/compras", label: "Compras" },
  { href: "/compras/por-pagar", label: "Por pagar" },
  { href: "/compras/proveedores", label: "Proveedores" },
];

export function PurchasesNav({ active }: { active: string }) {
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
