import * as React from "react";

import { cn } from "@/lib/utils";

/** Casilla grande (táctil) con texto y ayuda. Funciona dentro de formularios normales. */
function SwitchField({
  label,
  hint,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type"> & { label: string; hint?: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 rounded-md border p-3 has-checked:border-primary", className)}>
      <input type="checkbox" className="mt-0.5 size-6 accent-(--primary)" {...props} />
      <span className="space-y-1">
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-sm text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

export { SwitchField };
