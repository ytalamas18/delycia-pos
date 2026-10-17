import type { z } from "zod";

import type { Prisma } from "@/generated/prisma/client";

import { db } from "../db/client";
import type { Tx } from "../db/transaction";

/**
 * Ajustes guardados en la tabla Setting. Cada módulo define sus claves con un esquema Zod
 * y un valor por defecto, así un valor corrupto en la base nunca rompe la app.
 */
export type SettingDefinition<T> = { key: string; schema: z.ZodType<T>; defaultValue: T };

export function defineSetting<T>(key: string, schema: z.ZodType<T>, defaultValue: T): SettingDefinition<T> {
  return { key, schema, defaultValue };
}

export async function getSetting<T>(def: SettingDefinition<T>, client: Tx = db): Promise<T> {
  const row = await client.setting.findUnique({ where: { key: def.key } });
  if (!row) return def.defaultValue;
  const parsed = def.schema.safeParse(row.value);
  return parsed.success ? parsed.data : def.defaultValue;
}

export async function setSetting<T>(def: SettingDefinition<T>, value: T, client: Tx = db): Promise<T> {
  const valid = def.schema.parse(value);
  const json = valid as Prisma.InputJsonValue;
  await client.setting.upsert({
    where: { key: def.key },
    create: { key: def.key, value: json },
    update: { value: json },
  });
  return valid;
}
