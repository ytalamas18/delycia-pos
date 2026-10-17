import type { ActionResult } from "@/core/actions/types";
import { cn } from "@/lib/utils";

/** Mensaje de éxito o error bajo un formulario. */
export function FormStatus({ state, className }: { state: ActionResult; className?: string }) {
  const text = state.ok ? state.message : state.error;
  if (!text) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={cn("text-sm font-medium", state.ok ? "text-green-700 dark:text-green-400" : "text-destructive", className)}
    >
      {text}
    </p>
  );
}

export function FieldError({ state, name }: { state: ActionResult; name: string }) {
  if (state.ok || !state.fieldErrors?.[name]) return null;
  return <p className="text-sm text-destructive">{state.fieldErrors[name]}</p>;
}
