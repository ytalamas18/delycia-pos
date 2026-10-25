import { z } from "zod";

import { parseMoney } from "@/core/money";
import { parseQuantity } from "@/core/quantity";
import { PurchaseDocType, SupplierPaymentMethod } from "@/generated/prisma/enums";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (label: string) => z.string().trim().regex(ISO_DATE, `Fecha de ${label} inválida`);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((v) => v || null);

const money = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Ingresa ${label}`)
    .transform((value, ctx) => {
      try {
        const cents = parseMoney(value);
        if (cents <= 0) throw new Error();
        return cents;
      } catch {
        ctx.addIssue({ code: "custom", message: `${label[0].toUpperCase()}${label.slice(1)} inválido (mayor a 0)` });
        return z.NEVER;
      }
    });

export const supplierInput = z.object({
  name: z.string().trim().min(1, "Ingresa el nombre").max(80, "Máximo 80 caracteres"),
  phone: optionalText(30),
  document: optionalText(30),
  note: optionalText(200),
  active: z.boolean().default(true),
});

export const purchaseLineInput = z.object({
  productId: z.string().min(1, "Elige un ítem"),
  /** id de la presentación, o "unit:KG" para comprar en una unidad compatible. */
  presentation: z.string().min(1, "Elige cómo se compró"),
  quantity: z
    .string()
    .trim()
    .min(1, "Ingresa la cantidad")
    .transform((value, ctx) => {
      try {
        const q = parseQuantity(value);
        if (q.lte(0)) throw new Error();
        return q;
      } catch {
        ctx.addIssue({ code: "custom", message: "Cantidad inválida" });
        return z.NEVER;
      }
    }),
  totalCents: money("el total de la línea"),
});

export const purchaseInput = z
  .object({
    date: date("la compra"),
    supplierId: z.string().trim().optional().transform((v) => v || null),
    docType: z.enum(PurchaseDocType).default("NONE"),
    docNumber: optionalText(40),
    note: optionalText(200),
    dueDate: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || ISO_DATE.test(v), "Vencimiento inválido"),
    paymentMode: z.enum(["CASH_FULL", "CREDIT", "PARTIAL"]),
    paymentMethod: z.enum(SupplierPaymentMethod).default("CASH"),
    /** Solo pago parcial. */
    paidNow: z.string().trim().optional(),
    lines: z.array(purchaseLineInput).min(1, "Agrega al menos un ítem"),
  })
  .superRefine((data, ctx) => {
    if (data.paymentMode !== "CASH_FULL" && !data.supplierId) {
      ctx.addIssue({ code: "custom", path: ["supplierId"], message: "En crédito o pago parcial, elige el proveedor" });
    }
  });

export const supplierPaymentInput = z.object({
  date: date("pago"),
  amountCents: money("el monto"),
  method: z.enum(SupplierPaymentMethod),
  note: optionalText(200),
});

export const reasonInput = z.string().trim().min(3, "Escribe el motivo").max(200, "Máximo 200 caracteres");

export type SupplierInput = z.input<typeof supplierInput>;
export type PurchaseInput = z.input<typeof purchaseInput>;
export type PurchaseLineInput = z.input<typeof purchaseLineInput>;
export type SupplierPaymentInput = z.input<typeof supplierPaymentInput>;
