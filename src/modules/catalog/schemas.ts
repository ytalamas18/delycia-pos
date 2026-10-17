import { z } from "zod";

import { parseMoney } from "@/core/money";

/** Texto de dinero escrito por el usuario ("38", "38,50") → centavos. */
const money = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Ingresa ${label}`)
    .transform((value, ctx) => {
      try {
        return parseMoney(value);
      } catch {
        ctx.addIssue({ code: "custom", message: `${label[0].toUpperCase()}${label.slice(1)} inválido` });
        return z.NEVER;
      }
    });

const name = z.string().trim().min(1, "Ingresa un nombre").max(60, "Máximo 60 caracteres");

export const categoryInput = z.object({ name });

export const productInput = z.object({
  name,
  categoryId: z.string().min(1, "Elige una categoría"),
  priceCents: money("el precio").refine((v) => v > 0, "El precio debe ser mayor a 0"),
  sendsToKitchen: z.boolean(),
  active: z.boolean(),
});

export const modifierInput = z.object({
  name: z.string().trim().min(1, "Ingresa el modificador").max(40, "Máximo 40 caracteres"),
  // Vacío = sin costo. Admite negativos no: un modificador no descuenta.
  priceDeltaCents: z
    .string()
    .trim()
    .transform((v) => (v === "" ? "0" : v))
    .pipe(money("el recargo")),
});

export type CategoryInput = z.input<typeof categoryInput>;
export type ProductInput = z.input<typeof productInput>;
export type ModifierInput = z.input<typeof modifierInput>;
