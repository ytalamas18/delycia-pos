import { z } from "zod";

const serviceType = z.enum(["DINE_IN", "TAKEAWAY"]);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

export const orderHeaderInput = z
  .object({
    channel: z.enum(["LOCAL", "PEYA"]),
    serviceType,
    tableNumber: optionalText(10),
    customerName: optionalText(60),
  })
  .refine((h) => h.serviceType !== "DINE_IN" || h.tableNumber || h.customerName, {
    message: "Para comer aquí indica la mesa o el nombre del cliente",
    path: ["tableNumber"],
  })
  // Para llevar no tiene mesa (por si quedó escrita antes de cambiar el tipo).
  .transform((h) => (h.serviceType === "TAKEAWAY" ? { ...h, tableNumber: null } : h));

export const draftLineInput = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1, "Cantidad mínima 1").max(99, "Cantidad máxima 99"),
  modifierIds: z.array(z.string()).default([]),
  note: z.string().trim().max(120, "Nota de máximo 120 caracteres").default(""),
  serviceType,
});

export const draftLinesInput = z.array(draftLineInput).min(1, "Agrega al menos un producto");

export const itemUpdateInput = z.object({
  quantity: z.number().int().min(1).max(99),
  note: z.string().trim().max(120).default(""),
  serviceType,
});

export type OrderHeaderInput = z.input<typeof orderHeaderInput>;
export type DraftLineInput = z.input<typeof draftLineInput>;
export type ItemUpdateInput = z.input<typeof itemUpdateInput>;
