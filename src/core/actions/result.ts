import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { DomainError, isUniqueViolation } from "../errors";

import type { ActionResult } from "./types";

export type { ActionResult };

/**
 * Ejecuta la acción y traduce los errores a mensajes en español.
 * Los errores inesperados se registran y se muestran como un mensaje genérico.
 */
export async function toActionResult(
  fn: () => Promise<string | void>,
  messages: { duplicate?: string } = {},
): Promise<ActionResult> {
  try {
    const message = await fn();
    return { ok: true, message: message ?? undefined };
  } catch (error) {
    unstable_rethrow(error); // deja pasar redirect()/notFound() de Next
    if (error instanceof DomainError) return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
    if (error instanceof z.ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
      // Con un solo problema, se muestra tal cual (ej. "indica la mesa o el nombre del cliente").
      const summary = error.issues.length === 1 ? error.issues[0].message : "Revisa los datos marcados.";
      return { ok: false, error: summary, fieldErrors };
    }
    if (isUniqueViolation(error)) return { ok: false, error: messages.duplicate ?? "Ese registro ya existe." };
    console.error("[acción] error inesperado", error);
    return { ok: false, error: "Ocurrió un error inesperado. Intenta de nuevo." };
  }
}
