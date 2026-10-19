// Sin Decimal (que trae el cliente Prisma): se puede usar en componentes de cliente.
import type { BaseUnit } from "@/generated/prisma/enums";

export type { BaseUnit };

export const BASE_UNITS: BaseUnit[] = ["UNIT", "KG", "G", "L", "ML"];

export const UNIT_LABEL: Record<BaseUnit, string> = { UNIT: "unidad", KG: "kg", G: "g", L: "litro", ML: "ml" };
export const UNIT_SHORT: Record<BaseUnit, string> = { UNIT: "u", KG: "kg", G: "g", L: "L", ML: "ml" };
