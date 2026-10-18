"use client";

import { useState } from "react";

import { formatMoney } from "@/core/money";
import { cn } from "@/lib/utils";

export type DailyBar = { day: string; totalCents: number; orders: number };

const shortDate = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/**
 * Barras simples del total vendido por día (una sola serie: un solo color, sin leyenda).
 * Al pasar el ratón o tocar una barra se ve el detalle; la tabla de abajo tiene los mismos números.
 */
export function DailyBars({ bars }: { bars: DailyBar[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...bars.map((b) => b.totalCents), 1);
  // Con muchos días, solo algunas fechas abajo para que no se encimen.
  const labelEvery = Math.ceil(bars.length / 10);
  const shown = active !== null ? bars[active] : null;

  return (
    <figure className="space-y-2">
      <div className="flex h-6 items-center text-sm" aria-live="polite">
        {shown ? (
          <span>
            <strong>{shortDate(shown.day)}</strong> · {formatMoney(shown.totalCents)} · {shown.orders} órdenes
          </span>
        ) : (
          <span className="text-muted-foreground">Toca una barra para ver el detalle</span>
        )}
      </div>
      <div className="relative h-48 border-b border-border">
        {[0.5, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-dashed border-border/70" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2.5 right-0 bg-background pl-1 text-xs text-muted-foreground tabular-nums">
              {formatMoney(Math.round(max * f))}
            </span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-0.5 pr-20">
          {bars.map((b, i) => (
            <button
              key={b.day}
              type="button"
              className="group flex h-full min-w-0 flex-1 items-end justify-center"
              aria-label={`${shortDate(b.day)}: ${formatMoney(b.totalCents)}, ${b.orders} órdenes`}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
            >
              <span
                className={cn(
                  "block w-full max-w-12 rounded-t-[4px] bg-primary transition-opacity",
                  active !== null && active !== i && "opacity-40",
                )}
                style={{ height: `${(b.totalCents / max) * 100}%`, minHeight: b.totalCents > 0 ? 2 : 0 }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-0.5 pr-20 text-xs text-muted-foreground">
        {bars.map((b, i) => (
          <span key={b.day} className="min-w-0 flex-1 truncate text-center tabular-nums">
            {i % labelEvery === 0 ? shortDate(b.day) : ""}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">Total vendido por día</figcaption>
    </figure>
  );
}
