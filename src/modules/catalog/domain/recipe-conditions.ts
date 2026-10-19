// Sin Decimal (que trae el cliente Prisma): se puede usar en componentes de cliente.
import type { RecipeCondition } from "@/generated/prisma/enums";

export type { RecipeCondition };

export const RECIPE_CONDITIONS: RecipeCondition[] = ["ALWAYS", "TAKEAWAY", "DINE_IN"];

export const RECIPE_CONDITION_LABEL: Record<RecipeCondition, string> = {
  ALWAYS: "Siempre",
  TAKEAWAY: "Solo para llevar",
  DINE_IN: "Solo comer aquí",
};
