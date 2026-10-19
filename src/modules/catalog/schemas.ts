import { z } from "zod";

import { parseMoney } from "@/core/money";
import { parseQuantity } from "@/core/quantity";
import { BaseUnit, ItemType } from "@/generated/prisma/enums";

import { parseUnitCost } from "./domain/costs";
import { isSellable, tracksStockFor } from "./domain/item-types";

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

/** Texto opcional → Decimal o null (vacío = sin dato). */
const optionalDecimal = (label: string, parse: (v: string) => unknown) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (!value) return null;
      try {
        return parse(value) as ReturnType<typeof parseQuantity>;
      } catch {
        ctx.addIssue({ code: "custom", message: `${label} inválido` });
        return z.NEVER;
      }
    });

/**
 * Ítem del catálogo. Las reglas por tipo se aplican aquí (no en la pantalla):
 * - Normal y Preparado se venden (precio > 0); Ingrediente e Insumo no (precio 0, no van a cocina).
 * - Preparado nunca maneja stock; Ingrediente siempre; Normal e Insumo según el check.
 * - El stock mínimo solo se guarda si el ítem maneja stock.
 */
export const productInput = z
  .object({
    name,
    categoryId: z.string().min(1, "Elige una categoría"),
    type: z.enum(ItemType).default("NORMAL"),
    priceCents: z.string().trim().default(""),
    sendsToKitchen: z.boolean(),
    active: z.boolean(),
    baseUnit: z.enum(BaseUnit).default("UNIT"),
    tracksStock: z.boolean().default(false),
    minStock: optionalDecimal("Stock mínimo", parseQuantity).refine((v) => !v || !v.isNegative(), "El stock mínimo no puede ser negativo"),
    lastCostCents: optionalDecimal("Costo", parseUnitCost),
  })
  .transform((data, ctx) => {
    const sellable = isSellable(data.type);
    let priceCents = 0;
    if (sellable) {
      try {
        priceCents = parseMoney(data.priceCents);
      } catch {
        ctx.addIssue({ code: "custom", path: ["priceCents"], message: data.priceCents ? "Precio inválido" : "Ingresa el precio" });
        return z.NEVER;
      }
      if (priceCents <= 0) {
        ctx.addIssue({ code: "custom", path: ["priceCents"], message: "El precio debe ser mayor a 0" });
        return z.NEVER;
      }
    }
    const tracksStock = tracksStockFor(data.type, data.tracksStock);
    return {
      ...data,
      priceCents,
      sendsToKitchen: sellable && data.sendsToKitchen,
      // Un Preparado no tiene stock: su unidad es siempre "unidad".
      baseUnit: data.type === "PREPARED" ? ("UNIT" as const) : data.baseUnit,
      tracksStock,
      minStock: tracksStock ? data.minStock : null,
    };
  });

export const presentationInput = z.object({
  name: z.string().trim().min(1, "Ingresa la presentación").max(40, "Máximo 40 caracteres"),
  factor: z
    .string()
    .trim()
    .min(1, "Ingresa cuántas unidades trae")
    .transform((value, ctx) => {
      try {
        const v = parseQuantity(value);
        if (v.lte(0)) throw new Error();
        return v;
      } catch {
        ctx.addIssue({ code: "custom", message: "Cantidad inválida (mayor a 0, hasta 3 decimales)" });
        return z.NEVER;
      }
    }),
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
export type PresentationInput = z.input<typeof presentationInput>;
