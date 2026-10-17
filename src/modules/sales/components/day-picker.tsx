import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { addDays, businessDate } from "@/core/time";

const longDate = new Intl.DateTimeFormat("es-BO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** Selector de día: anterior / siguiente / hoy, y calendario. `query` conserva otros filtros. */
export function DayPicker({ basePath, date, query = {} }: { basePath: string; date: string; query?: Record<string, string> }) {
  const today = businessDate();
  const href = (d: string) => `${basePath}?${new URLSearchParams({ ...query, fecha: d })}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="icon" aria-label="Día anterior">
        <Link href={href(addDays(date, -1))}>
          <ChevronLeft />
        </Link>
      </Button>
      <form action={basePath} className="flex items-center gap-2">
        {Object.entries(query).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input
          type="date"
          name="fecha"
          defaultValue={date}
          max={today}
          className="h-11 rounded-md border bg-background px-3 text-base"
          aria-label="Fecha"
        />
        <Button type="submit" variant="secondary">
          Ver
        </Button>
      </form>
      <Button asChild variant="outline" size="icon" aria-label="Día siguiente" disabled={date >= today}>
        <Link href={href(date >= today ? date : addDays(date, 1))}>
          <ChevronRight />
        </Link>
      </Button>
      {date !== today && (
        <Button asChild variant="ghost">
          <Link href={href(today)}>Hoy</Link>
        </Button>
      )}
      <span className="text-lg font-medium capitalize">
        {date === today ? "Hoy, " : ""}
        {longDate.format(new Date(`${date}T12:00:00Z`))}
      </span>
    </div>
  );
}
