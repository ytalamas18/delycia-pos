import { z } from "zod";

import { isPermission } from "@/core/auth/permissions";
import { normalizeUsername } from "@/core/auth/service";

export const userInput = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(60, "Máximo 60 caracteres"),
  username: z
    .string()
    .transform(normalizeUsername)
    .pipe(
      z
        .string()
        .min(3, "Mínimo 3 caracteres")
        .max(30, "Máximo 30 caracteres")
        .regex(/^[a-z0-9._-]+$/, "Solo letras sin tilde, números, punto, guion y guion bajo"),
    ),
  roleId: z.string().min(1, "Elige un rol"),
  active: z.boolean().default(true),
});
export type UserInput = z.input<typeof userInput>;

export const pinFields = z
  .object({
    newPin: z.string().regex(/^\d{4}$/, "4 dígitos"),
    confirmPin: z.string(),
  })
  .refine((v) => v.newPin === v.confirmPin, { message: "Los dos PIN no coinciden.", path: ["confirmPin"] });

export const roleInput = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(40, "Máximo 40 caracteres"),
  permissions: z.array(z.string()).transform((keys) => [...new Set(keys.filter(isPermission))]),
  active: z.boolean().default(true),
});
export type RoleInput = z.input<typeof roleInput>;

/** "  Mesero  Turno Noche" → "mesero turno noche": para que no haya dos roles que solo difieran en mayúsculas. */
export function roleNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
