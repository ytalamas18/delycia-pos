import { notFound } from "next/navigation";

import { modules } from "@/config/modules";

/** Si el módulo está desactivado en src/config/modules.ts, sus rutas devuelven 404. */
export function requireModule(id: string) {
  if (!modules.isEnabled(id)) notFound();
}
