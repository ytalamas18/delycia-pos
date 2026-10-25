import { z } from "zod";

import { parseQuantity } from "@/core/quantity";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const quantity = (opts: { allowZero?: boolean } = {}) =>
  z
    .string()
    .trim()
    .min(1, "Ingresa la cantidad")
    .transform((value, ctx) => {
      try {
        const q = parseQuantity(value);
        if (q.isNegative() || (!opts.allowZero && q.isZero())) throw new Error();
        return q;
      } catch {
        ctx.addIssue({ code: "custom", message: "Cantidad inválida" });
        return z.NEVER;
      }
    });

const optionalText = z
  .string()
  .trim()
  .max(200, "Máximo 200 caracteres")
  .optional()
  .transform((v) => v || null);

export const productionInput = z.object({
  productId: z.string().min(1, "Elige el ingrediente"),
  quantity: quantity(),
  date: z.string().regex(ISO, "Fecha inválida"),
  /** Costo por unidad en Bs (texto). Vacío = el estimado por la receta. */
  unitCost: z.string().trim().optional(),
  note: optionalText,
});

export const countInput = z.object({
  date: z.string().regex(ISO, "Fecha inválida"),
  note: optionalText,
  lines: z
    .array(z.object({ productId: z.string().min(1), counted: quantity({ allowZero: true }), reason: optionalText }))
    .min(1, "Ingresa al menos un ítem contado"),
});

export const consumptionInput = z.object({
  productId: z.string().min(1, "Elige el ítem"),
  quantity: quantity(),
  reason: z.string().trim().min(3, "Escribe el motivo").max(200),
});

export type ProductionInput = z.input<typeof productionInput>;
export type CountInput = z.input<typeof countInput>;
export type ConsumptionInput = z.input<typeof consumptionInput>;
