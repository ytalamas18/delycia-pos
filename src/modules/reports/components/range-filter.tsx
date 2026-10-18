import Link from "next/link";

import { Button } from "@/components/ui/button";
import { businessDate } from "@/core/time";
import { cn } from "@/lib/utils";

import { rangePresets, type DateRange } from "../domain/range";

/** Filtro común: atajos (Hoy, Ayer, 7 días, Este mes) o desde/hasta. `keep` conserva la vista y otros filtros. */
export function RangeFilter({ range, keep }: { range: DateRange; keep: Record<string, string> }) {
  const href = (r: DateRange) => `/reportes?${new URLSearchParams({ ...keep, desde: r.from, hasta: r.to })}`;
  const today = businessDate();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap gap-2">
        {rangePresets().map((p) => {
          const active = p.range.from === range.from && p.range.to === range.to;
          return (
            <Link
              key={p.key}
              href={href(p.range)}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex h-11 items-center rounded-full border px-4 font-medium",
                active ? "border-primary bg-primary text-primary-foreground" : "bg-card",
              )}
            >
              {p.label}
            </Link>
          );
        })}
      </div>
      <form action="/reportes" className="flex flex-wrap items-end gap-2">
        {Object.entries(keep).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label className="space-y-1 text-sm font-medium">
          <span className="block text-muted-foreground">Desde</span>
          <input type="date" name="desde" defaultValue={range.from} max={today} className="h-11 rounded-md border bg-background px-3 text-base" />
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span className="block text-muted-foreground">Hasta</span>
          <input type="date" name="hasta" defaultValue={range.to} max={today} className="h-11 rounded-md border bg-background px-3 text-base" />
        </label>
        <Button type="submit" variant="secondary">
          Ver
        </Button>
      </form>
    </div>
  );
}
