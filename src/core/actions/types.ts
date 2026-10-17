/** Respuesta estándar de una Server Action para mostrar en el formulario. Seguro de importar en el cliente. */
export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export const initialActionResult: ActionResult = { ok: true };
