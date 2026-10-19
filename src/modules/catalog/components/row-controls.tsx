"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

/** Botones subir/bajar y activar/desactivar de una fila del catálogo. */
export function RowControls({
  active,
  isFirst,
  isLast,
  onMove,
  onToggle,
  canMove = true,
}: {
  active: boolean;
  /** false = sin subir/bajar (ej. lista agrupada por tipo, donde el orden no es el del POS). */
  canMove?: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMove: (direction: "up" | "down") => Promise<void>;
  onToggle: (active: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-1">
      {canMove && (
        <>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Subir"
            disabled={pending || isFirst}
            onClick={() => startTransition(() => onMove("up"))}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Bajar"
            disabled={pending || isLast}
            onClick={() => startTransition(() => onMove("down"))}
          >
            <ArrowDown />
          </Button>
        </>
      )}
      <Button
        variant={active ? "outline" : "secondary"}
        className="w-28"
        disabled={pending}
        onClick={() => startTransition(() => onToggle(!active))}
      >
        {active ? "Desactivar" : "Activar"}
      </Button>
    </div>
  );
}
