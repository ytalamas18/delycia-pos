import Link from "next/link";

import { cn } from "@/lib/utils";

/** Pestañas de un ítem: datos y, si corresponde, receta y costo. */
export function ProductTabs({ id, active, showRecipe }: { id: string; active: "datos" | "receta"; showRecipe: boolean }) {
  if (!showRecipe) return null;
  const tabs = [
    { key: "datos", href: `/catalogo/productos/${id}`, label: "Datos" },
    { key: "receta", href: `/catalogo/productos/${id}/receta`, label: "Receta y costo" },
  ];
  return (
    <div className="flex gap-2 border-b">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "-mb-px border-b-2 px-4 py-2 text-base font-medium",
            t.key === active ? "border-primary text-primary" : "border-transparent text-muted-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

/** Tiene pestaña de receta: Preparado, Ingrediente o cualquier ítem con modificadores. */
export const hasRecipeTab = (p: { type: string; modifiers: unknown[] }) =>
  p.type === "PREPARED" || p.type === "INGREDIENT" || p.modifiers.length > 0;
